import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Store } from "../src/store.js";
import { Conductor, type ConductorDeps } from "../src/conductor.js";
import { WorktreeManager } from "../src/worktree.js";
import { NoopLinearSync } from "../src/linear.js";
import { FakeAgentRunner, type AgentRunner } from "../src/agent.js";
import { resolveConfig } from "../src/config.js";
import { git } from "../src/exec.js";
import type { AgentResult, JournalEvent, Run, Task, TaskSpec } from "../src/types.js";
import { tempRepo, task } from "./helpers.js";

// ---- shared setup (mirrors test/conductor.test.ts) --------------------------

function setup(repo: string, tasks: Task[], over: Partial<Run["config"]> = {}) {
  const store = new Store(join(repo, ".dgorch", "state.sqlite"));
  const runId = tasks[0]!.runId;
  const run: Run = {
    id: runId,
    prdPath: "/x",
    repoPath: repo,
    goal: "chaos",
    status: "active",
    costSpent: 0,
    config: resolveConfig(repo, { concurrency: 1, gates: [], ...over }),
    createdAt: Date.now(),
  };
  store.createRun(run);
  store.insertTasks(tasks);
  return { store, runId };
}

function deps(store: Store, repo: string, runner: AgentRunner): ConductorDeps {
  return { store, runner, linear: new NoopLinearSync(), worktrees: new WorktreeManager(repo) };
}

/** Pull the taskId out of a journal payload if it has one. */
function taskIdOf(e: JournalEvent): string | null {
  const p = e.payload as { taskId?: unknown } | null;
  return p !== null && typeof p === "object" && typeof p.taskId === "string" ? p.taskId : null;
}

// ---- 1. double crash then resume --------------------------------------------

test("CHAOS: double crash on the same task, third resume completes — no lost or duplicated work", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const a = task(runId, { title: "A", files: ["src/gen/a.ts"] });
  const b = task(runId, { title: "B", deps: [a.id], files: ["src/gen/b.ts"] });
  const c = task(runId, { title: "C", deps: [b.id], files: ["src/gen/c.ts"] });
  const { store } = setup(repo, [a, b, c]);

  // Crash #1 while running B. A completes first (dep chain), then the process dies.
  const runner1 = new FakeAgentRunner({ throwOn: [b.id] });
  await assert.rejects(() => new Conductor(runId, deps(store, repo, runner1)).execute());
  assert.equal(store.getTask(a.id)!.status, "done");
  assert.equal(store.getTask(b.id)!.status, "in_progress"); // orphan

  // Crash #2: a fresh process resumes, recovers B, claims it again — and dies again.
  const runner2 = new FakeAgentRunner({ throwOn: [b.id] });
  await assert.rejects(() => new Conductor(runId, deps(store, repo, runner2)).execute());
  assert.equal(store.getTask(b.id)!.status, "in_progress"); // orphaned a second time

  // Third process is healthy and finishes the run.
  const runner3 = new FakeAgentRunner();
  const outcome = await new Conductor(runId, deps(store, repo, runner3)).execute();

  assert.equal(outcome.stopReason, "complete");
  for (const id of [a.id, b.id, c.id]) assert.equal(store.getTask(id)!.status, "done");

  // A executed exactly once across all three runner generations.
  const allExecuted = [...runner1.executed, ...runner2.executed, ...runner3.executed];
  assert.equal(
    allExecuted.filter((id) => id === a.id).length,
    1,
    `A must run exactly once across crashes, ran in: ${JSON.stringify(allExecuted)}`,
  );
  // And B/C only ever completed on the healthy third pass.
  assert.deepEqual(runner3.executed, [b.id, c.id]);
});

// ---- 2. resume after completion is a no-op ----------------------------------

test("CHAOS: resuming an already-complete run is a no-op", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const t = task(runId, { title: "solo", files: ["src/gen/solo.ts"] });
  const { store } = setup(repo, [t]);

  const runner1 = new FakeAgentRunner();
  const first = await new Conductor(runId, deps(store, repo, runner1)).execute();
  assert.equal(first.stopReason, "complete");
  assert.equal(store.getTask(t.id)!.status, "done");
  const attemptsAfterFirst = store.getTask(t.id)!.attempts;

  // A brand-new conductor + runner over the same store must find nothing to do.
  const runner2 = new FakeAgentRunner();
  const second = await new Conductor(runId, deps(store, repo, runner2)).execute();

  assert.equal(second.stopReason, "complete");
  assert.deepEqual(runner2.executed, []); // zero re-execution
  const after = store.getTask(t.id)!;
  assert.equal(after.status, "done");
  assert.equal(after.attempts, attemptsAfterFirst); // untouched
});

// ---- 3. partial work in a crashed worktree never leaks -----------------------

/** Writes partial junk into the workspace, then dies mid-task. */
class LeakyCrashRunner implements AgentRunner {
  async run(_spec: TaskSpec, workspace: string): Promise<AgentResult> {
    const abs = join(workspace, "junk", "leak.txt");
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "half-finished work from a crashed worker\n");
    throw new Error("CRASH after writing partial work");
  }
}

test("CHAOS: partial work in a crashed worktree never reaches the integration branch", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const t = task(runId, { title: "real work", files: ["src/gen/real.ts"] });
  const { store } = setup(repo, [t]);

  // Crash mid-task after dirtying the workspace.
  await assert.rejects(() => new Conductor(runId, deps(store, repo, new LeakyCrashRunner())).execute());
  assert.equal(store.getTask(t.id)!.status, "in_progress"); // orphan

  // Healthy resume re-runs the task from a clean worktree.
  const runner2 = new FakeAgentRunner();
  const outcome = await new Conductor(runId, deps(store, repo, runner2)).execute();
  assert.equal(outcome.stopReason, "complete");
  assert.equal(store.getTask(t.id)!.status, "done");

  // The integration branch carries the real marker file — and zero junk.
  const tree = await git(["ls-tree", "-r", "--name-only", "orchestrator/integration"], repo);
  assert.equal(tree.code, 0, tree.stderr);
  const names = tree.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(!names.includes("junk/leak.txt"), `leaked partial work into integration: ${JSON.stringify(names)}`);
  assert.ok(names.includes("src/gen/real.ts"), `marker file missing from integration: ${JSON.stringify(names)}`);
});

// ---- 4. file-scope conflicts are serialized ----------------------------------

/** Records a wall-clock execution window per task, with real work time inside. */
class TimedRunner implements AgentRunner {
  public readonly windows = new Map<string, { start: number; end: number }>();
  async run(spec: TaskSpec, workspace: string): Promise<AgentResult> {
    const start = Date.now();
    await sleep(50);
    const rel = spec.files[0] ?? `done/${spec.id}.txt`;
    const abs = join(workspace, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `completed ${spec.id}: ${spec.title} @ ${Date.now()}\n`);
    const end = Date.now();
    this.windows.set(spec.id, { start, end });
    return { ok: true, summary: `Completed: ${spec.title}`, filesChanged: [rel], costTokens: 1 };
  }
}

test("CHAOS: two tasks sharing a file scope never execute concurrently, even with spare capacity", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const shared = ["src/gen/shared.ts"];
  const t1 = task(runId, { title: "writer one", files: shared });
  const t2 = task(runId, { title: "writer two", files: shared });
  const { store } = setup(repo, [t1, t2], { concurrency: 2 });
  const runner = new TimedRunner();

  const outcome = await new Conductor(runId, deps(store, repo, runner)).execute();

  assert.equal(outcome.stopReason, "complete");
  assert.equal(store.getTask(t1.id)!.status, "done");
  assert.equal(store.getTask(t2.id)!.status, "done");

  const w1 = runner.windows.get(t1.id);
  const w2 = runner.windows.get(t2.id);
  assert.ok(w1 && w2, "both tasks must have executed");
  // Non-overlap: one window must start only after the other has fully ended.
  assert.ok(
    w1.start >= w2.end || w2.start >= w1.end,
    `execution windows overlap: t1=[${w1.start},${w1.end}] t2=[${w2.start},${w2.end}]`,
  );
});

// ---- 5. journal survives and explains a crash-resume cycle -------------------

test("CHAOS: journal explains the double-crash story — recoveries, re-claims, terminal endings", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const a = task(runId, { title: "A", files: ["src/gen/a.ts"] });
  const b = task(runId, { title: "B", deps: [a.id], files: ["src/gen/b.ts"] });
  const c = task(runId, { title: "C", deps: [b.id], files: ["src/gen/c.ts"] });
  const { store } = setup(repo, [a, b, c]);

  // Replay scenario 1: two crashes on B, then a healthy completion.
  await assert.rejects(() => new Conductor(runId, deps(store, repo, new FakeAgentRunner({ throwOn: [b.id] }))).execute());
  await assert.rejects(() => new Conductor(runId, deps(store, repo, new FakeAgentRunner({ throwOn: [b.id] }))).execute());
  const outcome = await new Conductor(runId, deps(store, repo, new FakeAgentRunner())).execute();
  assert.equal(outcome.stopReason, "complete");

  const journal = store.readJournal(runId);

  // Each resume recovered the orphaned B — at least one recovery event survives.
  const recoveries = journal.filter((e) => e.type === "recover_orphan");
  assert.ok(recoveries.length >= 1, "journal must record at least one orphan recovery");

  // B was claimed once per process generation: crash, crash, success → 3 claims.
  const claimsForB = journal.filter((e) => e.type === "claim" && taskIdOf(e) === b.id);
  assert.equal(claimsForB.length, 3, `expected B claimed by all three runs, got ${claimsForB.length}`);

  // The story ends well: the LAST journal event for every task is terminal.
  const TERMINAL_EVENTS = new Set(["done", "human_review", "dead"]);
  for (const t of [a, b, c]) {
    const events = journal.filter((e) => taskIdOf(e) === t.id);
    assert.ok(events.length > 0, `no journal events for task ${t.title}`);
    const last = events[events.length - 1]!;
    assert.ok(
      TERMINAL_EVENTS.has(last.type),
      `task ${t.title} ends on non-terminal journal event '${last.type}'`,
    );
  }
});
