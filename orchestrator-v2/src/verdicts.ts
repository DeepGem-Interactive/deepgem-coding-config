// Human-verdict intake: detect in Linear what the human decided about tasks
// parked in human_review / blocked, and apply those decisions to the engine
// store. Linear is the human's UI; the store stays the source of truth.
import type { HumanVerdict, Task } from "./types.js";
import { HUMAN_WAIT_STATUSES } from "./types.js";
import type { Store } from "./store.js";
import { log } from "./logger.js";

/** Snapshot of a Linear issue: workflow state + the newest human comment. */
export interface IssueState {
  stateName: string;
  lastComment: string | null;
}

/** Where verdicts come from. Swappable so the engine can run fully offline. */
export interface VerdictSource {
  fetchIssueStates(issueIds: string[]): Promise<Map<string, IssueState>>;
}

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

const ISSUE_STATES_QUERY = `query($ids: [ID!]) {
  issues(filter: { id: { in: $ids } }) {
    nodes {
      id
      state { name }
      comments { nodes { body createdAt } }
    }
  }
}`;

// Loose shapes for defensive parsing of the GraphQL response.
interface RawComment {
  body?: unknown;
  createdAt?: unknown;
}
interface RawIssue {
  id?: unknown;
  state?: { name?: unknown } | null;
  comments?: { nodes?: RawComment[] | null } | null;
}
interface RawResponse {
  data?: { issues?: { nodes?: RawIssue[] | null } | null } | null;
  errors?: unknown;
}

/**
 * Polls Linear for the current state of mirrored issues. Read-only and
 * best-effort: any failure logs a warning and yields an empty map — a missed
 * poll just means the verdict is picked up next sweep, never a crash.
 */
export class LinearVerdictSource implements VerdictSource {
  constructor(
    private apiKey: string,
    private fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async fetchIssueStates(issueIds: string[]): Promise<Map<string, IssueState>> {
    const out = new Map<string, IssueState>();
    if (issueIds.length === 0) return out;
    try {
      const res = await this.fetchImpl(LINEAR_ENDPOINT, {
        method: "POST",
        // Linear personal API keys go in Authorization verbatim — no Bearer prefix.
        headers: { "Content-Type": "application/json", Authorization: this.apiKey },
        body: JSON.stringify({ query: ISSUE_STATES_QUERY, variables: { ids: issueIds } }),
      });
      if (!res.ok) {
        log.warn("linear verdicts: HTTP error", { status: res.status });
        return out;
      }
      const json = (await res.json()) as RawResponse;
      if (json.errors) {
        log.warn("linear verdicts: GraphQL errors", { errors: JSON.stringify(json.errors).slice(0, 200) });
        return out;
      }
      for (const node of json.data?.issues?.nodes ?? []) {
        if (!node || typeof node.id !== "string") continue;
        const stateName = node.state?.name;
        if (typeof stateName !== "string") continue;
        out.set(node.id, { stateName, lastComment: newestComment(node.comments?.nodes ?? []) });
      }
      return out;
    } catch (err) {
      log.warn("linear verdicts: fetch failed", { error: String(err) });
      return new Map();
    }
  }
}

/** Newest comment body by createdAt; null when there are no usable comments. */
function newestComment(nodes: RawComment[]): string | null {
  let newest: { body: string; at: number } | null = null;
  for (const c of nodes) {
    if (!c || typeof c.body !== "string" || typeof c.createdAt !== "string") continue;
    const at = Date.parse(c.createdAt);
    if (Number.isNaN(at)) continue;
    if (!newest || at > newest.at) newest = { body: c.body, at };
  }
  return newest ? newest.body : null;
}

/**
 * Translate Linear states into engine verdicts for tasks awaiting the human.
 * Done → approve. In Progress / Todo → changes requested (the human dragged it
 * back, with their newest comment as the why). Anything else: still waiting.
 */
export function computeVerdicts(tasks: Task[], states: Map<string, IssueState>): HumanVerdict[] {
  const verdicts: HumanVerdict[] = [];
  for (const t of tasks) {
    if (!HUMAN_WAIT_STATUSES.includes(t.status)) continue;
    if (!t.linearIssueId) continue;
    const st = states.get(t.linearIssueId);
    if (!st) continue;
    if (st.stateName === "Done") {
      verdicts.push({ taskId: t.id, verdict: "approve", comment: null });
    } else if (st.stateName === "In Progress" || st.stateName === "Todo") {
      verdicts.push({ taskId: t.id, verdict: "changes", comment: st.lastComment });
    }
    // Any other state (Human Review, Backlog, Canceled, …): no verdict yet.
  }
  return verdicts;
}

/**
 * Apply human verdicts to the store. Approvals close the task; change requests
 * fold the comment into the task description (so the next worker sees it cold),
 * record a durable lesson, and recycle the task to ready with fresh attempts.
 */
export function applyVerdicts(
  store: Store,
  runId: string,
  verdicts: HumanVerdict[],
): { approved: number; changesRequested: number } {
  let approved = 0;
  let changesRequested = 0;
  for (const v of verdicts) {
    const task = store.getTask(v.taskId);
    if (!task) {
      log.warn("verdict for unknown task ignored", { taskId: v.taskId });
      continue;
    }
    if (v.verdict === "approve") {
      store.transition(v.taskId, { status: "done" }, "human_approved");
      approved += 1;
      log.info(`human approved ${task.title}`, { taskId: v.taskId });
    } else {
      const comment = v.comment && v.comment.trim().length > 0 ? v.comment : null;
      store.amendDescription(
        v.taskId,
        task.description + "\n\nCHANGES REQUESTED (human):\n" + (comment ?? "(no comment provided)"),
      );
      if (comment) store.addLesson(runId, lessonFromComment(comment), v.taskId);
      store.transition(
        v.taskId,
        { status: "ready", attempts: 0, assignee: null, error: null },
        "human_changes_requested",
      );
      changesRequested += 1;
      log.info(`human requested changes on ${task.title}`, { taskId: v.taskId });
    }
  }
  return { approved, changesRequested };
}

/** Distill a human comment into a one-line durable rule for future tasks. */
function lessonFromComment(comment: string): string {
  const firstLine =
    comment
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? comment.trim();
  const oneLine = firstLine.replace(/\s+/g, " ");
  return oneLine.length > 200 ? oneLine.slice(0, 197) + "..." : oneLine;
}
