import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store.js";
import { Conductor, type ConductorDeps } from "./conductor.js";
import { WorktreeManager } from "./worktree.js";
import { NoopLinearSync, RealLinearSync, type LinearSync } from "./linear.js";
import { SdkAgentRunner, FakeAgentRunner, type AgentRunner } from "./agent.js";
import { SdkPlanner, FakePlanner, type Plan } from "./planner.js";
import { resolveConfig } from "./config.js";
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

function dbFor(repoPath: string, dbPath?: string): string {
  return dbPath ?? join(repoPath, ".dgorch", "state.sqlite");
}

function pickLinear(): LinearSync {
  const key = process.env.LINEAR_API_KEY;
  const team = process.env.LINEAR_TEAM_ID;
  if (key && team) {
    log.info("linear: real sync enabled");
    return new RealLinearSync(key, team, process.env.LINEAR_PROJECT_ID);
  }
  return new NoopLinearSync();
}

function pickRunner(fake: boolean): AgentRunner {
  return fake ? new FakeAgentRunner() : new SdkAgentRunner(process.env.ORCH_WORKER_MODEL);
}

export async function startRun(opts: StartOptions) {
  const dbPath = dbFor(opts.repoPath, opts.dbPath);
  const store = new Store(dbPath);
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

  const planner = opts.fake
    ? new FakePlanner(loadPlan(opts.planPath))
    : new SdkPlanner(process.env.ORCH_PLANNER_MODEL);
  const tasks = await planner.plan(prd, opts.goal, runId);
  store.insertTasks(tasks);
  log.info("planned tasks", { count: tasks.length, runId });

  const linear = pickLinear();
  for (const t of tasks) await linear.upsertIssue(t);

  const deps: ConductorDeps = {
    store,
    runner: pickRunner(Boolean(opts.fake)),
    linear,
    worktrees: new WorktreeManager(opts.repoPath),
    lessons: opts.lessons ?? [],
  };
  const outcome = await new Conductor(runId, deps).execute();
  store.close();
  return { runId, outcome };
}

export async function resumeRun(repoPath: string, runId: string, opts: { fake?: boolean; dbPath?: string } = {}) {
  const store = new Store(dbFor(repoPath, opts.dbPath));
  const run = store.getRun(runId);
  if (!run) throw new Error(`no run ${runId} in store`);
  store.appendJournal(runId, "run_resume", {});
  const deps: ConductorDeps = {
    store,
    runner: pickRunner(Boolean(opts.fake)),
    linear: pickLinear(),
    worktrees: new WorktreeManager(repoPath),
  };
  const outcome = await new Conductor(runId, deps).execute();
  store.close();
  return { runId, outcome };
}

export function statusReport(repoPath: string, runId: string, dbPath?: string) {
  const store = new Store(dbFor(repoPath, dbPath));
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
