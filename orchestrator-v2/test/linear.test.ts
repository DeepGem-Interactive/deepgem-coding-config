import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { RealLinearSync, STATUS_TO_LINEAR } from "../src/linear.js";
import type { Task, TaskStatus, Run } from "../src/types.js";
import { task } from "./helpers.js";

// ---- fixtures ---------------------------------------------------------------

const STATE_NODES = [
  { id: "state-backlog", name: "Backlog" },
  { id: "state-todo", name: "Todo" },
  { id: "state-in-progress", name: "In Progress" },
  { id: "state-bot-review", name: "Bot Review" },
  { id: "state-human-review", name: "Human Review" },
  { id: "state-done", name: "Done" },
  { id: "state-canceled", name: "Canceled" },
];

interface RecordedCall {
  query: string;
  variables: Record<string, any>;
  authorization: string | null;
}

/** Offline fetch stub: records every GraphQL call, returns canned responses. */
function makeFetchStub(opts: { issueId?: string } = {}) {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, any> };
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ query: body.query, variables: body.variables, authorization: headers["Authorization"] ?? null });
    const q = body.query;
    let data: unknown;
    if (q.includes("issueCreate")) {
      data = { issueCreate: { success: true, issue: { id: opts.issueId ?? "issue-123" } } };
    } else if (q.includes("issueUpdate")) {
      data = { issueUpdate: { success: true } };
    } else if (q.includes("commentCreate")) {
      data = { commentCreate: { success: true } };
    } else if (q.includes("projects")) {
      data = { teams: { nodes: [{ id: "team-1", projects: { nodes: [{ id: "proj-1", name: "Orchestrator" }] } }] } };
    } else if (q.includes("teams")) {
      data = { teams: { nodes: [{ id: "team-1", key: "DEE", states: { nodes: STATE_NODES } }] } };
    } else {
      data = {};
    }
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchImpl };
}

/** Real Store on a temp sqlite file, with one run + one task inserted. */
function tempStore(): { store: Store; runId: string; t: Task } {
  const dir = mkdtempSync(join(tmpdir(), "dgorch-linear-"));
  const store = new Store(join(dir, "state.db"));
  const run: Run = {
    id: "run-1",
    prdPath: "/tmp/prd.md",
    repoPath: "/tmp/repo",
    goal: "test the linear mirror",
    status: "active",
    costSpent: 0,
    config: {
      concurrency: 1,
      costCap: null,
      maxAttempts: 3,
      taskTimeoutMs: 60_000,
      integrationBranch: "main",
      gates: [],
    },
    createdAt: Date.now(),
  };
  store.createRun(run);
  const t = task(run.id, { title: "Build the widget", description: "Make it spin", acceptance: ["spins", "no wobble"] });
  store.insertTasks([t]);
  return { store, runId: run.id, t };
}

// ---- tests ------------------------------------------------------------------

test("upsertIssue creates the issue and persists the mapping in the store", async () => {
  const { store, t } = tempStore();
  const { calls, fetchImpl } = makeFetchStub({ issueId: "issue-abc" });
  const sync = new RealLinearSync(store, "lin_api_test", "DEE", undefined, fetchImpl);

  await sync.upsertIssue(t);

  const creates = calls.filter((c) => c.query.includes("issueCreate"));
  assert.equal(creates.length, 1);
  const create = creates[0]!;
  assert.equal(create.variables.input.teamId, "team-1");
  assert.equal(create.variables.input.title, "Build the widget");
  assert.equal(create.variables.input.description, "Make it spin\n\n**Done when:**\n- spins\n- no wobble");
  // Raw key, no Bearer prefix.
  assert.equal(create.authorization, "lin_api_test");
  // Mapping persisted through the real store.
  assert.equal(store.getTask(t.id)?.linearIssueId, "issue-abc");
  store.close();
});

test("second upsertIssue for the same task makes no issueCreate call", async () => {
  const { store, t } = tempStore();
  const { calls, fetchImpl } = makeFetchStub();
  const sync = new RealLinearSync(store, "lin_api_test", "DEE", undefined, fetchImpl);

  await sync.upsertIssue(t);
  const refreshed = store.getTask(t.id);
  assert.ok(refreshed?.linearIssueId);
  await sync.upsertIssue(refreshed!);
  // Even with the stale in-memory task (no linearIssueId), the store wins.
  await sync.upsertIssue(t);

  const creates = calls.filter((c) => c.query.includes("issueCreate"));
  assert.equal(creates.length, 1);
  store.close();
});

test("setStatus sends the mapped stateId", async () => {
  const { store, t } = tempStore();
  const { calls, fetchImpl } = makeFetchStub();
  const sync = new RealLinearSync(store, "lin_api_test", "DEE", undefined, fetchImpl);

  await sync.upsertIssue(t);
  const refreshed = store.getTask(t.id)!;
  await sync.setStatus(refreshed, "in_progress");

  const updates = calls.filter((c) => c.query.includes("issueUpdate"));
  assert.equal(updates.length, 1);
  const update = updates[0]!;
  assert.equal(update.variables.id, refreshed.linearIssueId);
  assert.equal(update.variables.input.stateId, "state-in-progress");
  store.close();
});

test("a fetch that throws does not throw out of setStatus", async () => {
  const { store, runId } = tempStore();
  const failingFetch: typeof globalThis.fetch = async () => {
    throw new Error("network down");
  };
  const sync = new RealLinearSync(store, "lin_api_test", "DEE", undefined, failingFetch);
  const t = task(runId, { linearIssueId: "issue-already-mapped" });

  await assert.doesNotReject(() => sync.setStatus(t, "done"));
  await assert.doesNotReject(() => sync.upsertIssue(task(runId)));
  await assert.doesNotReject(() => sync.comment(t, "hello"));
  store.close();
});

test("STATUS_TO_LINEAR covers every TaskStatus", () => {
  const statuses: TaskStatus[] = [
    "pending",
    "ready",
    "in_progress",
    "bot_review",
    "human_review",
    "done",
    "blocked",
    "dead",
  ];
  for (const s of statuses) {
    const name = STATUS_TO_LINEAR[s];
    assert.ok(typeof name === "string" && name.length > 0, `missing Linear state for "${s}"`);
  }
  assert.equal(STATUS_TO_LINEAR.pending, "Backlog");
  assert.equal(STATUS_TO_LINEAR.ready, "Todo");
  assert.equal(STATUS_TO_LINEAR.in_progress, "In Progress");
  assert.equal(STATUS_TO_LINEAR.bot_review, "Bot Review");
  assert.equal(STATUS_TO_LINEAR.human_review, "Human Review");
  assert.equal(STATUS_TO_LINEAR.done, "Done");
  assert.equal(STATUS_TO_LINEAR.blocked, "In Progress");
  assert.equal(STATUS_TO_LINEAR.dead, "Canceled");
});
