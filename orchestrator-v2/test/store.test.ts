import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { task } from "./helpers.js";
import type { Run } from "../src/types.js";

function freshStore(): { store: Store; runId: string } {
  const dir = mkdtempSync(join(tmpdir(), "dgorch-store-"));
  const store = new Store(join(dir, "state.sqlite"));
  const runId = randomUUID();
  const run: Run = {
    id: runId,
    prdPath: "/x/prd.md",
    repoPath: dir,
    goal: "g",
    status: "active",
    costSpent: 0,
    config: DEFAULT_CONFIG,
    createdAt: Date.now(),
  };
  store.createRun(run);
  return { store, runId };
}

test("round-trips runs and tasks", () => {
  const { store, runId } = freshStore();
  const t = task(runId, { title: "Build hub", acceptance: ["renders", "tests pass"], deps: ["x"], userVisible: true });
  store.insertTasks([t]);
  const got = store.getTask(t.id)!;
  assert.equal(got.title, "Build hub");
  assert.deepEqual(got.acceptance, ["renders", "tests pass"]);
  assert.equal(got.userVisible, true);
  assert.deepEqual(got.deps, ["x"]);
});

test("transition updates the task AND appends a journal event atomically", () => {
  const { store, runId } = freshStore();
  const t = task(runId);
  store.insertTasks([t]);
  store.transition(t.id, { status: "in_progress", assignee: "Yoda" }, "claim");
  const got = store.getTask(t.id)!;
  assert.equal(got.status, "in_progress");
  assert.equal(got.assignee, "Yoda");
  const journal = store.readJournal(runId);
  assert.ok(journal.some((e) => e.type === "claim"));
});

test("cost accounting accumulates", () => {
  const { store, runId } = freshStore();
  assert.equal(store.addCost(runId, 100), 100);
  assert.equal(store.addCost(runId, 50), 150);
  assert.equal(store.getRun(runId)!.costSpent, 150);
});
