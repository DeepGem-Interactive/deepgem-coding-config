import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";
import { Conductor, type ConductorDeps } from "../src/conductor.js";
import { WorktreeManager } from "../src/worktree.js";
import { NoopLinearSync } from "../src/linear.js";
import { FakeAgentRunner } from "../src/agent.js";
import { resolveConfig } from "../src/config.js";
import type { Run, Task } from "../src/types.js";
import { tempRepo, task } from "./helpers.js";

function setup(repo: string, tasks: Task[], over: Partial<Run["config"]> = {}) {
  const store = new Store(join(repo, ".dgorch", "state.sqlite"));
  const runId = tasks[0]!.runId;
  const run: Run = {
    id: runId,
    prdPath: "/x",
    repoPath: repo,
    goal: "g",
    status: "active",
    costSpent: 0,
    config: resolveConfig(repo, { concurrency: 1, gates: [], ...over }),
    createdAt: Date.now(),
  };
  store.createRun(run);
  store.insertTasks(tasks);
  return { store, runId };
}

function deps(store: Store, repo: string, runner: FakeAgentRunner): ConductorDeps {
  return { store, runner, linear: new NoopLinearSync(), worktrees: new WorktreeManager(repo) };
}

test("happy path: deps respected, backend → done, user-visible → human_review", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const t1 = task(runId, { title: "API", files: ["src/gen/a.ts"] });
  const t2 = task(runId, { title: "UI", deps: [t1.id], files: ["src/gen/b.ts"], userVisible: true });
  const { store } = setup(repo, [t1, t2]);
  const runner = new FakeAgentRunner();

  const outcome = await new Conductor(runId, deps(store, repo, runner)).execute();

  assert.equal(store.getTask(t1.id)!.status, "done");
  assert.equal(store.getTask(t2.id)!.status, "human_review");
  assert.equal(outcome.stopReason, "awaiting_human");
  // t2 ran only after t1 finished (dependency order).
  assert.deepEqual(runner.executed, [t1.id, t2.id]);
});

test("retries a transient failure, then completes", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const t = task(runId, { title: "flaky" });
  const { store } = setup(repo, [t]);
  const runner = new FakeAgentRunner({ failNTimes: { [t.id]: 2 } });

  await new Conductor(runId, deps(store, repo, runner)).execute();

  const got = store.getTask(t.id)!;
  assert.equal(got.status, "done");
  assert.equal(got.attempts, 2); // two recorded failures before success
});

test("dead-letters after maxAttempts and cascades to dependents", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const bad = task(runId, { title: "doomed" });
  const child = task(runId, { title: "child", deps: [bad.id] });
  const { store } = setup(repo, [bad, child], { maxAttempts: 2 });
  const runner = new FakeAgentRunner({ alwaysFail: [bad.id] });

  await new Conductor(runId, deps(store, repo, runner)).execute();

  assert.equal(store.getTask(bad.id)!.status, "dead");
  assert.equal(store.getTask(child.id)!.status, "dead"); // cascade
});

test("DURABILITY: crash mid-run, resume completes with 0 lost / 0 duplicated work", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const a = task(runId, { title: "A", files: ["src/gen/a.ts"] });
  const b = task(runId, { title: "B", deps: [a.id], files: ["src/gen/b.ts"] });
  const c = task(runId, { title: "C", deps: [b.id], files: ["src/gen/c.ts"] });
  const { store } = setup(repo, [a, b, c]);

  // First pass crashes (throws) while running B — A is already done, B is left
  // in_progress in the store (an orphan), C never started.
  const runner1 = new FakeAgentRunner({ throwOn: [b.id] });
  await assert.rejects(() => new Conductor(runId, deps(store, repo, runner1)).execute());
  assert.equal(store.getTask(a.id)!.status, "done");
  assert.equal(store.getTask(b.id)!.status, "in_progress"); // orphan from the crash
  assert.deepEqual(runner1.executed, [a.id]); // only A completed pre-crash

  // Resume with a healthy runner — derives everything from the store.
  const runner2 = new FakeAgentRunner();
  const outcome = await new Conductor(runId, deps(store, repo, runner2)).execute();

  // Everything ends done.
  for (const id of [a.id, b.id, c.id]) assert.equal(store.getTask(id)!.status, "done");
  assert.equal(outcome.stopReason, "complete");
  // 0 duplicated: A (already done) was NOT re-run on resume.
  assert.ok(!runner2.executed.includes(a.id), "completed task must not re-run");
  // 0 lost: the orphaned B and the never-started C both ran on resume.
  assert.deepEqual(runner2.executed, [b.id, c.id]);
});

test("cost cap pauses the run with work remaining", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  // Each fake task costs 100 tokens; cap 50 lets the first claim through, then
  // pauses (spend 100 ≥ 50) with the second still ready.
  const t1 = task(runId, { title: "one", files: ["src/gen/1.ts"] });
  const t2 = task(runId, { title: "two", files: ["src/gen/2.ts"] });
  const { store } = setup(repo, [t1, t2], { costCap: 50 });
  const runner = new FakeAgentRunner();

  const outcome = await new Conductor(runId, deps(store, repo, runner)).execute();
  assert.equal(outcome.stopReason, "cost_cap");
  assert.equal(store.getRun(runId)!.costSpent, 100);
  assert.equal(runner.executed.length, 1); // only one task ran before the cap

});
