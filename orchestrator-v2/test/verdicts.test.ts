import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { task } from "./helpers.js";
import { LinearVerdictSource, computeVerdicts, applyVerdicts } from "../src/verdicts.js";
import type { IssueState } from "../src/verdicts.js";
import type { Run } from "../src/types.js";

function freshStore(): { store: Store; runId: string } {
  const dir = mkdtempSync(join(tmpdir(), "dgorch-verdicts-"));
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

test("computeVerdicts maps Linear states to verdicts, ignoring tasks not awaiting human", () => {
  const runId = randomUUID();
  const approved = task(runId, { status: "human_review", linearIssueId: "lin-done" });
  const changed = task(runId, { status: "blocked", linearIssueId: "lin-back" });
  const stillWaiting = task(runId, { status: "human_review", linearIssueId: "lin-waiting" });
  const notAwaiting = task(runId, { status: "in_progress", linearIssueId: "lin-done" });
  const noIssue = task(runId, { status: "human_review", linearIssueId: null });

  const states = new Map<string, IssueState>([
    ["lin-done", { stateName: "Done", lastComment: "ship it" }],
    ["lin-back", { stateName: "In Progress", lastComment: "use real data, not mocks" }],
    ["lin-waiting", { stateName: "Human Review", lastComment: null }],
  ]);

  const verdicts = computeVerdicts([approved, changed, stillWaiting, notAwaiting, noIssue], states);
  assert.equal(verdicts.length, 2);
  assert.deepEqual(
    verdicts.find((v) => v.taskId === approved.id),
    { taskId: approved.id, verdict: "approve", comment: null },
  );
  assert.deepEqual(
    verdicts.find((v) => v.taskId === changed.id),
    { taskId: changed.id, verdict: "changes", comment: "use real data, not mocks" },
  );
});

test("applyVerdicts: approve transitions the task to done", () => {
  const { store, runId } = freshStore();
  const t = task(runId, { status: "human_review", linearIssueId: "lin-1" });
  store.insertTasks([t]);

  const counts = applyVerdicts(store, runId, [{ taskId: t.id, verdict: "approve", comment: null }]);

  assert.deepEqual(counts, { approved: 1, changesRequested: 0 });
  const got = store.getTask(t.id)!;
  assert.equal(got.status, "done");
  assert.ok(store.readJournal(runId).some((e) => e.type === "human_approved"));
});

test("applyVerdicts: changes resets the task, amends description, records a lesson", () => {
  const { store, runId } = freshStore();
  const t = task(runId, {
    status: "human_review",
    linearIssueId: "lin-2",
    description: "build the dashboard",
    attempts: 2,
    assignee: "Bender",
    error: "previous failure",
  });
  store.insertTasks([t]);

  const comment = "Use the design tokens, not hardcoded hex colors";
  const counts = applyVerdicts(store, runId, [{ taskId: t.id, verdict: "changes", comment }]);

  assert.deepEqual(counts, { approved: 0, changesRequested: 1 });
  const got = store.getTask(t.id)!;
  assert.equal(got.status, "ready");
  assert.equal(got.attempts, 0);
  assert.equal(got.assignee, null);
  assert.equal(got.error, null);
  assert.equal(got.description, "build the dashboard\n\nCHANGES REQUESTED (human):\n" + comment);
  assert.ok(store.listLessons(runId).includes(comment));
  assert.ok(store.readJournal(runId).some((e) => e.type === "human_changes_requested"));
});

test("LinearVerdictSource parses a GraphQL response; newest comment wins", async () => {
  const payload = {
    data: {
      issues: {
        nodes: [
          {
            id: "lin-1",
            state: { name: "In Progress" },
            comments: {
              nodes: [
                { body: "older comment", createdAt: "2026-06-01T10:00:00.000Z" },
                { body: "fix the button color", createdAt: "2026-06-09T10:00:00.000Z" },
                { body: "middle comment", createdAt: "2026-06-05T10:00:00.000Z" },
              ],
            },
          },
          { id: "lin-2", state: { name: "Done" }, comments: { nodes: [] } },
        ],
      },
    },
  };
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchStub = (async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    return { ok: true, status: 200, json: async () => payload };
  }) as unknown as typeof fetch;

  const source = new LinearVerdictSource("lin_api_test_key", fetchStub);
  const states = await source.fetchIssueStates(["lin-1", "lin-2"]);

  assert.equal(states.size, 2);
  assert.deepEqual(states.get("lin-1"), { stateName: "In Progress", lastComment: "fix the button color" });
  assert.deepEqual(states.get("lin-2"), { stateName: "Done", lastComment: null });

  // Request shape: Linear endpoint, raw key in Authorization (no Bearer prefix).
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.linear.app/graphql");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers["Authorization"], "lin_api_test_key");
  const body = JSON.parse(String(calls[0]!.init.body)) as { variables: { ids: string[] } };
  assert.deepEqual(body.variables.ids, ["lin-1", "lin-2"]);
});

test("LinearVerdictSource returns an empty map when fetch throws", async () => {
  const fetchStub = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;

  const source = new LinearVerdictSource("lin_api_test_key", fetchStub);
  const states = await source.fetchIssueStates(["lin-1"]);
  assert.equal(states.size, 0);

  // Empty input never touches the network.
  let called = false;
  const tracker = (async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  }) as unknown as typeof fetch;
  const idle = new LinearVerdictSource("k", tracker);
  assert.equal((await idle.fetchIssueStates([])).size, 0);
  assert.equal(called, false);
});
