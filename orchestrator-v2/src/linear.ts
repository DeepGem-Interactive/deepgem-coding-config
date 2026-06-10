import type { Task, TaskStatus } from "./types.js";
import { log } from "./logger.js";

/**
 * Linear is the human-facing MIRROR of engine state — not the engine's memory.
 * The Conductor pushes status changes here; the human reviews and (Phase 4) the
 * engine receives verdicts via webhook. This interface keeps Linear swappable
 * and lets the durable core run fully offline.
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
 * Real Linear mirror over the GraphQL API. Active only when LINEAR_API_KEY and a
 * team are configured; otherwise the engine uses NoopLinearSync. Kept minimal
 * and dependency-free (uses fetch). Issue ids are cached per task in-memory; a
 * production build would persist the engine-task → Linear-issue map in the store.
 */
export class RealLinearSync implements LinearSync {
  private issueByTask = new Map<string, string>();
  constructor(
    private apiKey: string,
    private teamId: string,
    private projectId?: string,
  ) {}

  private async gql(query: string, variables: Record<string, unknown>): Promise<any> {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: this.apiKey },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: any; errors?: unknown };
    if (json.errors) throw new Error("Linear GraphQL: " + JSON.stringify(json.errors));
    return json.data;
  }

  async upsertIssue(task: Task): Promise<void> {
    if (this.issueByTask.has(task.id)) return;
    const data = await this.gql(
      `mutation($title:String!,$desc:String!,$team:String!,$project:String){issueCreate(input:{title:$title,description:$desc,teamId:$team,projectId:$project}){issue{id}}}`,
      { title: task.title, desc: describeTask(task), team: this.teamId, project: this.projectId ?? null },
    );
    const id = data?.issueCreate?.issue?.id;
    if (id) this.issueByTask.set(task.id, id);
  }

  async setStatus(task: Task, status: TaskStatus): Promise<void> {
    const issueId = this.issueByTask.get(task.id);
    if (!issueId) return;
    const stateName = STATUS_TO_LINEAR[status];
    const states = await this.gql(
      `query($team:String!){team(id:$team){states{nodes{id name}}}}`,
      { team: this.teamId },
    );
    const match = states?.team?.states?.nodes?.find((s: { name: string }) => s.name === stateName);
    if (!match) return;
    await this.gql(`mutation($id:String!,$state:String!){issueUpdate(id:$id,input:{stateId:$state}){success}}`, {
      id: issueId,
      state: match.id,
    });
  }

  async comment(task: Task, body: string): Promise<void> {
    const issueId = this.issueByTask.get(task.id);
    if (!issueId) return;
    await this.gql(`mutation($id:String!,$body:String!){commentCreate(input:{issueId:$id,body:$body}){success}}`, {
      id: issueId,
      body,
    });
  }
}

function describeTask(task: Task): string {
  const acc = task.acceptance.map((a) => `- ${a}`).join("\n");
  const deps = task.deps.length ? `\n\nDepends on: ${task.deps.join(", ")}` : "";
  return `${task.description}\n\n**Done when:**\n${acc}${deps}`;
}
