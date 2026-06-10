// Persistent Linear mirror.
//
// Linear is the human-facing MIRROR of engine state — not the engine's memory.
// The Conductor pushes status changes here; the human reviews in Linear and the
// engine receives verdicts via webhook. The engine-task → Linear-issue mapping
// is persisted in the Store (tasks.linear_issue_id), so it survives restarts.
//
// The mirror must never crash the engine: every RealLinearSync method catches
// its own failures, logs a warning, and returns normally.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Task, TaskStatus } from "./types.js";
import type { Store } from "./store.js";
import { log } from "./logger.js";

/**
 * Swappable Linear mirror. The durable core runs fully offline with
 * NoopLinearSync; RealLinearSync talks to the Linear GraphQL API.
 */
export interface LinearSync {
  upsertIssue(task: Task): Promise<void>;
  setStatus(task: Task, status: TaskStatus): Promise<void>;
  comment(task: Task, body: string): Promise<void>;
}

/** Default offline mirror: records intent to the log, no network. */
export class NoopLinearSync implements LinearSync {
  async upsertIssue(task: Task): Promise<void> {
    log.debug("linear(noop) upsert", { task: task.id, title: task.title });
  }
  async setStatus(task: Task, status: TaskStatus): Promise<void> {
    log.info(`linear(noop) ${task.id} → ${status}`);
  }
  async comment(task: Task, body: string): Promise<void> {
    log.debug("linear(noop) comment", { task: task.id, body: body.slice(0, 80) });
  }
}

/** Maps engine statuses to Linear workflow state names. */
export const STATUS_TO_LINEAR: Record<TaskStatus, string> = {
  pending: "Backlog",
  ready: "Todo",
  in_progress: "In Progress",
  bot_review: "Bot Review",
  human_review: "Human Review",
  done: "Done",
  blocked: "In Progress",
  dead: "Canceled",
};

/**
 * Resolve the Linear API key: LINEAR_API_KEY env var first, then
 * ~/.dgorch/linear.key (trimmed), else null.
 */
export function loadLinearKey(): string | null {
  const env = process.env.LINEAR_API_KEY;
  if (env) return env;
  try {
    const key = readFileSync(join(homedir(), ".dgorch", "linear.key"), "utf8").trim();
    return key || null;
  } catch {
    return null;
  }
}

// ---- GraphQL documents ------------------------------------------------------

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

const TEAM_QUERY = `query TeamByKey($key: String!) {
  teams(filter: { key: { eq: $key } }) {
    nodes { id key states { nodes { id name } } }
  }
}`;

const TEAM_PROJECTS_QUERY = `query TeamProjects($key: String!) {
  teams(filter: { key: { eq: $key } }) {
    nodes { id projects { nodes { id name } } }
  }
}`;

const ISSUE_CREATE = `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id } }
}`;

const ISSUE_UPDATE = `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`;

const COMMENT_CREATE = `mutation CommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) { success }
}`;

interface ResolvedMeta {
  teamId: string;
  /** Workflow state name → state id. */
  stateIds: Map<string, string>;
  projectId: string | null;
}

/**
 * Real Linear mirror over the GraphQL API. Resolves team/state/project ids
 * lazily on first use and caches them; persists issue ids via the Store so the
 * mapping survives restarts. All failures are logged and swallowed.
 */
export class RealLinearSync implements LinearSync {
  private resolution: Promise<ResolvedMeta> | null = null;

  constructor(
    private store: Store,
    private apiKey: string,
    private teamKey: string,
    private projectName?: string,
    private fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async upsertIssue(task: Task): Promise<void> {
    try {
      if (this.issueIdFor(task)) return; // already mirrored
      const meta = await this.ensureResolved();
      const input: Record<string, unknown> = {
        teamId: meta.teamId,
        title: task.title,
        description: describeTask(task),
      };
      if (meta.projectId) input.projectId = meta.projectId;
      const data = await this.gql(ISSUE_CREATE, { input });
      const issueId: unknown = data?.issueCreate?.issue?.id;
      if (typeof issueId === "string" && issueId) {
        this.store.setLinearIssue(task.id, issueId);
        log.debug("linear: issue created", { task: task.id, issue: issueId });
      } else {
        log.warn("linear: issueCreate returned no issue id", { task: task.id });
      }
    } catch (err) {
      log.warn("linear: upsertIssue failed", { task: task.id, error: String(err) });
    }
  }

  async setStatus(task: Task, status: TaskStatus): Promise<void> {
    try {
      const issueId = this.issueIdFor(task);
      if (!issueId) return;
      const meta = await this.ensureResolved();
      const stateName = STATUS_TO_LINEAR[status];
      const stateId = meta.stateIds.get(stateName);
      if (!stateId) {
        log.debug("linear: no workflow state for status", { status, stateName });
        return;
      }
      await this.gql(ISSUE_UPDATE, { id: issueId, input: { stateId } });
    } catch (err) {
      log.warn("linear: setStatus failed", { task: task.id, status, error: String(err) });
    }
  }

  async comment(task: Task, body: string): Promise<void> {
    try {
      const issueId = this.issueIdFor(task);
      if (!issueId) return;
      await this.gql(COMMENT_CREATE, { input: { issueId, body } });
    } catch (err) {
      log.warn("linear: comment failed", { task: task.id, error: String(err) });
    }
  }

  // ---- internals ------------------------------------------------------------

  /** Issue id from the task in hand, falling back to the persisted store row. */
  private issueIdFor(task: Task): string | null {
    return task.linearIssueId ?? this.store.getTask(task.id)?.linearIssueId ?? null;
  }

  /** Resolve team/state/project ids once; on failure allow a retry next call. */
  private ensureResolved(): Promise<ResolvedMeta> {
    if (!this.resolution) {
      this.resolution = this.resolve().catch((err) => {
        this.resolution = null;
        throw err;
      });
    }
    return this.resolution;
  }

  private async resolve(): Promise<ResolvedMeta> {
    const data = await this.gql(TEAM_QUERY, { key: this.teamKey });
    const team = data?.teams?.nodes?.[0];
    if (!team?.id) throw new Error(`team not found for key "${this.teamKey}"`);
    const stateIds = new Map<string, string>();
    for (const s of team.states?.nodes ?? []) {
      if (s?.id && s?.name) stateIds.set(String(s.name), String(s.id));
    }
    let projectId: string | null = null;
    if (this.projectName) {
      const pdata = await this.gql(TEAM_PROJECTS_QUERY, { key: this.teamKey });
      const nodes: { id?: string; name?: string }[] = pdata?.teams?.nodes?.[0]?.projects?.nodes ?? [];
      const match = nodes.find((p) => p.name === this.projectName);
      if (match?.id) projectId = match.id;
      else log.warn("linear: project not found by name", { project: this.projectName });
    }
    return { teamId: String(team.id), stateIds, projectId };
  }

  private async gql(query: string, variables: Record<string, unknown>): Promise<any> {
    const res = await this.fetchImpl(LINEAR_ENDPOINT, {
      method: "POST",
      // Linear expects the raw key — no "Bearer " prefix.
      headers: { "Content-Type": "application/json", Authorization: this.apiKey },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Linear HTTP ${res.status}`);
    const json = (await res.json()) as { data?: any; errors?: unknown };
    if (json.errors) throw new Error("Linear GraphQL: " + JSON.stringify(json.errors));
    return json.data;
  }
}

/** Issue body: description plus checkable acceptance criteria. */
function describeTask(task: Task): string {
  const bullets = task.acceptance.map((a) => `- ${a}`).join("\n");
  return `${task.description}\n\n**Done when:**\n${bullets}`;
}

/**
 * Factory: RealLinearSync when an API key and a team key are configured,
 * otherwise the offline NoopLinearSync. Env defaults: LINEAR_TEAM_KEY,
 * LINEAR_PROJECT_NAME.
 */
export function makeLinearSync(store: Store, opts: { teamKey?: string; projectName?: string } = {}): LinearSync {
  const apiKey = loadLinearKey();
  const teamKey = opts.teamKey ?? process.env.LINEAR_TEAM_KEY;
  if (apiKey && teamKey) {
    const projectName = opts.projectName ?? process.env.LINEAR_PROJECT_NAME;
    log.info("linear: mirror active", { team: teamKey, project: projectName ?? null });
    return new RealLinearSync(store, apiKey, teamKey, projectName);
  }
  log.info("linear: mirror disabled (no API key or team key) — using noop sync");
  return new NoopLinearSync();
}
