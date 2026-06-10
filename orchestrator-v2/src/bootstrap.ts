import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store.js";
import { Conductor, type ConductorDeps } from "./conductor.js";
import { WorktreeManager } from "./worktree.js";
import { makeLinearSync } from "./linear.js";
import { SdkAgentRunner, FakeAgentRunner, type AgentRunner } from "./agent.js";
import { SdkReviewer } from "./reviewer.js";
import { SdkPlanner, FakePlanner, type Plan } from "./planner.js";
import { resolveConfig } from "./config.js";
import { serveLoop, type ServeOptions, type ServeOutcome } from "./serve.js";
import type { Run, RunConfig } from "./types.js";
import { log } from "./logger.js";

export interface StartOptions {
  repoPath: string;
  prdPath: string;
  goal: string;
  dbPath?: string;
  fake?: boolean;
  /** For --fake: a literal plan JSON file. */
  planPath?: string;
  configOverrides?: Partial<RunConfig>;
  lessons?: string[];
}

export function openStore(repoPath: string, dbPath?: string): Store {
  return new Store(dbPath ?? join(repoPath, ".dgorch", "state.sqlite"));
}

function pickRunner(fake: boolean): AgentRunner {
  return fake ? new FakeAgentRunner() : new SdkAgentRunner(process.env.ORCH_WORKER_MODEL);
}

export function buildDeps(store: Store, repoPath: string, opts: { fake?: boolean; lessons?: string[] } = {}): ConductorDeps {
  const fake = Boolean(opts.fake);
  return {
    store,
    runner: pickRunner(fake),
    linear: makeLinearSync(store),
    worktrees: new WorktreeManager(repoPath),
    // Real runs get the SDK bot reviewer unless explicitly disabled; fake runs
    // keep the default auto-approve (tests inject their own).
    ...(fake || process.env.ORCH_BOT_REVIEW === "0" ? {} : { reviewer: new SdkReviewer(process.env.ORCH_REVIEWER_MODEL) }),
    lessons: opts.lessons ?? [],
  };
}

/** Create a run, plan the PRD into tasks, persist, and mirror to Linear. */
export async function createRunWithPlan(store: Store, opts: StartOptions): Promise<string> {
  const runId = randomUUID();
  const config = resolveConfig(opts.repoPath, opts.configOverrides);
  const prd = readFileSync(opts.prdPath, "utf8");
  const run: Run = {
    id: runId,
    prdPath: opts.prdPath,
    repoPath: opts.repoPath,
    goal: opts.goal,
    status: "active",
    costSpent: 0,
    config,
    createdAt: Date.now(),
  };
  store.createRun(run);
  store.appendJournal(runId, "run_start", { goal: opts.goal, prdPath: opts.prdPath });

  const planner = opts.fake ? new FakePlanner(loadPlan(opts.planPath)) : new SdkPlanner(process.env.ORCH_PLANNER_MODEL);
  const tasks = await planner.plan(prd, opts.goal, runId);
  store.insertTasks(tasks);
  log.info("planned tasks", { count: tasks.length, runId });

  const linear = makeLinearSync(store);
  for (const t of tasks) await linear.upsertIssue(store.getTask(t.id)!);
  return runId;
}

export async function startRun(opts: StartOptions) {
  const store = openStore(opts.repoPath, opts.dbPath);
  const runId = await createRunWithPlan(store, opts);
  const outcome = await new Conductor(runId, buildDeps(store, opts.repoPath, opts)).execute();
  store.close();
  return { runId, outcome };
}

export async function resumeRun(repoPath: string, runId: string, opts: { fake?: boolean; dbPath?: string } = {}) {
  const store = openStore(repoPath, opts.dbPath);
  const run = store.getRun(runId);
  if (!run) throw new Error(`no run ${runId} in store`);
  store.appendJournal(runId, "run_resume", {});
  const outcome = await new Conductor(runId, buildDeps(store, repoPath, opts)).execute();
  store.close();
  return { runId, outcome };
}

/** Long-running serve mode: run + keep watching Linear for human verdicts. */
export async function serveRun(
  opts: StartOptions & { runId?: string } & ServeOptions,
): Promise<{ runId: string; outcome: ServeOutcome }> {
  const store = openStore(opts.repoPath, opts.dbPath);
  let runId = opts.runId;
  if (runId) {
    if (!store.getRun(runId)) throw new Error(`no run ${runId} in store`);
    store.appendJournal(runId, "run_resume", { mode: "serve" });
  } else {
    runId = await createRunWithPlan(store, opts);
  }
  const outcome = await serveLoop(store, runId, buildDeps(store, opts.repoPath, opts), opts);
  store.close();
  return { runId, outcome };
}

export function statusReport(repoPath: string, runId: string, dbPath?: string) {
  const store = openStore(repoPath, dbPath);
  const run = store.getRun(runId);
  if (!run) throw new Error(`no run ${runId}`);
  const tasks = store.listTasks(runId);
  const byStatus: Record<string, number> = {};
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  store.close();
  return { run, tasks, byStatus };
}

function loadPlan(planPath?: string): Plan {
  if (planPath && existsSync(planPath)) return JSON.parse(readFileSync(planPath, "utf8")) as Plan;
  throw new Error("--fake requires --plan <file> with a literal task plan");
}
