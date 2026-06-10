import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";
import { serveLoop } from "../src/serve.js";
import { WorktreeManager } from "../src/worktree.js";
import { NoopLinearSync } from "../src/linear.js";
import { FakeAgentRunner } from "../src/agent.js";
import { resolveConfig } from "../src/config.js";
import type { VerdictSource } from "../src/verdicts.js";
import type { Run } from "../src/types.js";
import { tempRepo, task } from "./helpers.js";

/** Verdict source scripted per poll: each call shifts the next answer. */
class ScriptedSource implements VerdictSource {
  public polls = 0;
  constructor(private script: Array<Map<string, { stateName: string; lastComment: string | null }>>) {}
  async fetchIssueStates(): Promise<Map<string, { stateName: string; lastComment: string | null }>> {
    this.polls += 1;
    return this.script.shift() ?? new Map();
  }
}

test("serve: human rejects in Linear → fix re-runs with lesson → human approves → complete", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const backend = task(runId, { title: "api", files: ["src/gen/api.ts"] });
  const ui = task(runId, { title: "screen", files: ["src/gen/ui.ts"], userVisible: true, linearIssueId: "ISSUE-UI" });

  const store = new Store(join(repo, ".dgorch", "state.sqlite"));
  const run: Run = {
    id: runId,
    prdPath: "/x",
    repoPath: repo,
    goal: "g",
    status: "active",
    costSpent: 0,
    config: resolveConfig(repo, { concurrency: 2, gates: [] }),
    createdAt: Date.now(),
  };
  store.createRun(run);
  store.insertTasks([backend, ui]);

  const runner = new FakeAgentRunner();
  const source = new ScriptedSource([
    // poll 1: human moved the UI card back to In Progress with a comment
    new Map([["ISSUE-UI", { stateName: "In Progress", lastComment: "Add the six C's section" }]]),
    // poll 2: human approved
    new Map([["ISSUE-UI", { stateName: "Done", lastComment: null }]]),
  ]);

  const outcome = await serveLoop(
    store,
    runId,
    { store, runner, linear: new NoopLinearSync(), worktrees: new WorktreeManager(repo) },
    { pollSec: 0.01, verdictSource: source, maxCycles: 10 },
  );

  assert.equal(outcome.stopReason, "complete");
  assert.equal(store.getTask(backend.id)!.status, "done");
  const finalUi = store.getTask(ui.id)!;
  assert.equal(finalUi.status, "done");
  // The fix actually re-ran (ui executed twice), driven by the human's comment.
  assert.deepEqual(
    runner.executed.filter((id) => id === ui.id).length,
    2,
    "ui task should run once + once more after changes requested",
  );
  assert.match(finalUi.description, /CHANGES REQUESTED/i);
  // The rejection became a durable lesson.
  const lessons = store.listLessons(runId);
  assert.ok(lessons.some((l) => /six C/i.test(l)), `lesson recorded, got: ${JSON.stringify(lessons)}`);
  assert.equal(source.polls >= 2, true);
});

test("serve: no verdict source and no key → stops cleanly instead of spinning", async () => {
  const repo = tempRepo();
  const runId = randomUUID();
  const ui = task(runId, { title: "screen", files: ["src/gen/ui.ts"], userVisible: true, linearIssueId: "ISSUE-X" });
  const store = new Store(join(repo, ".dgorch", "state.sqlite"));
  store.createRun({
    id: runId,
    prdPath: "/x",
    repoPath: repo,
    goal: "g",
    status: "active",
    costSpent: 0,
    config: resolveConfig(repo, { concurrency: 1, gates: [] }),
    createdAt: Date.now(),
  });
  store.insertTasks([ui]);
  // Ensure no ambient key leaks into this test.
  const saved = process.env.LINEAR_API_KEY;
  delete process.env.LINEAR_API_KEY;
  const savedHome = process.env.HOME;
  process.env.HOME = repo; // no ~/.dgorch/linear.key here
  try {
    const outcome = await serveLoop(
      store,
      runId,
      { store, runner: new FakeAgentRunner(), linear: new NoopLinearSync(), worktrees: new WorktreeManager(repo) },
      { pollSec: 0.01, maxCycles: 5 },
    );
    assert.equal(outcome.stopReason, "no_verdict_source");
  } finally {
    if (saved) process.env.LINEAR_API_KEY = saved;
    process.env.HOME = savedHome;
  }
});
