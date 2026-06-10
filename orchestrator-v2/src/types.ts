// Core domain types for the durable orchestrator.

/** Task lifecycle. Mirrors the Linear pipeline but is owned by the engine. */
export type TaskStatus =
  | "pending" // created, dependencies not yet satisfied
  | "ready" // dependencies satisfied, waiting for a worker
  | "in_progress" // claimed by a worker, executing
  | "bot_review" // worker finished + gates passed, under automated review
  | "human_review" // passed bot review, awaiting the human (user-visible work)
  | "done" // approved / merged / complete
  | "blocked" // needs human input to proceed
  | "dead"; // exhausted retries — dead-letter

export const TERMINAL_STATUSES: TaskStatus[] = ["done", "dead"];
export const HUMAN_WAIT_STATUSES: TaskStatus[] = ["human_review", "blocked"];

export interface Task {
  id: string;
  runId: string;
  title: string;
  description: string;
  /** Concrete, checkable "done when…" conditions. */
  acceptance: string[];
  /** Task ids this task depends on. */
  deps: string[];
  /** File globs/paths this task owns — used for parallel-safety scheduling. */
  files: string[];
  /** True if the change is user-visible (gets Human Review + screenshots). */
  userVisible: boolean;
  status: TaskStatus;
  attempts: number;
  /** Worker/crew identity currently assigned (e.g. "Bender"), or null. */
  assignee: string | null;
  /** Git branch the worker's work landed on, or null. */
  branch: string | null;
  /** Last structured worker result. */
  result: AgentResult | null;
  /** Last error / blocker reason. */
  error: string | null;
  updatedAt: number;
}

export interface Run {
  id: string;
  prdPath: string;
  repoPath: string;
  goal: string;
  status: "active" | "awaiting_human" | "complete" | "failed";
  costSpent: number; // output tokens spent across the run
  config: RunConfig;
  createdAt: number;
}

export interface RunConfig {
  /** Max workers running at once. */
  concurrency: number;
  /** Hard ceiling on output tokens for the whole run; null = unbounded. */
  costCap: number | null;
  /** Max attempts before a task is dead-lettered. */
  maxAttempts: number;
  /** Per-task wall-clock timeout (ms). */
  taskTimeoutMs: number;
  /** Integration branch everything merges into. */
  integrationBranch: string;
  /** Verification gate commands run in each worktree before merge. */
  gates: GateSpec[];
}

export interface GateSpec {
  name: string; // e.g. "typecheck"
  command: string; // e.g. "npx tsc --noEmit"
  /** If true, only changed files matter (informational; command still runs). */
  incremental?: boolean;
}

/** A self-contained task spec handed to a worker. No external context needed. */
export interface TaskSpec {
  id: string;
  title: string;
  description: string;
  acceptance: string[];
  files: string[];
  assignee: string;
  /** Durable lessons learned from prior rejections, injected into every task. */
  lessons: string[];
}

/** Structured result a worker returns. Never parsed from terminal text. */
export interface AgentResult {
  ok: boolean;
  summary: string;
  filesChanged: string[];
  /** Output tokens this run consumed (for cost accounting). */
  costTokens: number;
  /** If ok=false, why. */
  error?: string;
}

export interface GateResult {
  name: string;
  passed: boolean;
  output: string;
}

/** Append-only journal event for replay/audit. */
export interface JournalEvent {
  seq: number;
  runId: string;
  ts: number;
  type: string;
  payload: unknown;
}
