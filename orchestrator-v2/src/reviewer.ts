import type { Reviewer } from "./conductor.js";
import type { Task } from "./types.js";
import { git } from "./exec.js";
import { log } from "./logger.js";

/** Cap on diff text sent to the reviewer model. */
const MAX_DIFF_CHARS = 40_000;

/**
 * Parse the reviewer agent's reply into a verdict.
 *
 * Contract: the final line of the reply must be exactly
 *   "VERDICT: APPROVE"  or  "VERDICT: REJECT: <one-line reason>".
 *
 * Fail safe: REJECT is checked first (a reply containing both rejects), and a
 * reply matching neither is treated as a rejection — we never silently approve.
 */
export function parseReviewVerdict(text: string): { approved: boolean; notes: string } {
  const reject = /VERDICT:\s*REJECT:?\s*(.*)/i.exec(text);
  if (reject) {
    const reason = (reject[1] ?? "").trim();
    return { approved: false, notes: reason || "rejected (no reason given)" };
  }
  if (/VERDICT:\s*APPROVE/i.test(text)) {
    return { approved: true, notes: "approved" };
  }
  return { approved: false, notes: "unparseable review reply" };
}

/**
 * Deterministic reviewer for tests and dry runs. Approves everything unless
 * the task id is listed in `reject`, and records every review call.
 */
export class FakeReviewer implements Reviewer {
  /** Task ids reviewed, in call order. */
  public reviewed: string[] = [];

  constructor(private opts: { reject?: Record<string, string> } = {}) {}

  async review(task: Task, _workspace?: string): Promise<{ approved: boolean; notes: string }> {
    this.reviewed.push(task.id);
    const note = this.opts.reject?.[task.id];
    if (note !== undefined) return { approved: false, notes: note };
    return { approved: true, notes: "ok" };
  }
}

/** Build the self-contained review prompt: task context + the diff to judge. */
function buildReviewPrompt(task: Task, stat: string, diff: string): string {
  return [
    "You are a strict senior code reviewer on an autonomous coding crew.",
    "",
    `Task under review: ${task.title}`,
    "",
    task.description,
    "",
    "Acceptance criteria:",
    ...task.acceptance.map((a) => `- ${a}`),
    "",
    "Review ONLY the diff below. Judge it for: correctness bugs, regressions,",
    "and mismatches with the acceptance criteria. Do not review code outside",
    "the diff, do not request stylistic rewrites, and do not edit any files.",
    "",
    "Commit summary:",
    stat,
    "",
    "Diff:",
    diff,
    "",
    "The FINAL LINE of your reply MUST be exactly one of:",
    "VERDICT: APPROVE",
    "VERDICT: REJECT: <one-line reason>",
  ].join("\n");
}

/** Truncate text to the cap, marking the cut so the model knows it is partial. */
function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[... diff truncated at ${max} chars ...]`;
}

/** Shape of the Agent SDK stream messages we care about. */
interface SdkReviewMessage {
  type: string;
  result?: unknown;
}

/**
 * Real bot reviewer, backed by the Claude Agent SDK. Reads the last commit's
 * diff in the worker's workspace and asks a reviewer agent for a verdict.
 * Lazy-imported so the SDK stays an optional dependency.
 */
export class SdkReviewer implements Reviewer {
  constructor(private model?: string) {}

  async review(task: Task, workspace: string): Promise<{ approved: boolean; notes: string }> {
    const { stat, diff } = await this.collectDiff(workspace);

    let query: unknown;
    try {
      ({ query } = await import("@anthropic-ai/claude-agent-sdk"));
    } catch (e) {
      throw new Error(
        'SdkReviewer requires "@anthropic-ai/claude-agent-sdk". ' +
          "`npm i @anthropic-ai/claude-agent-sdk`, or plug in FakeReviewer/AutoApproveReviewer instead. " +
          String(e),
      );
    }

    const prompt = buildReviewPrompt(task, stat, diff);
    const iterator = (
      query as (a: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<SdkReviewMessage>
    )({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        cwd: workspace,
        ...(this.model ? { model: this.model } : {}),
      },
    });

    // Take the LAST message with type === "result" and a string .result.
    let reply = "";
    for await (const msg of iterator) {
      if (msg.type === "result" && typeof msg.result === "string") reply = msg.result;
    }

    const verdict = parseReviewVerdict(reply);
    log.debug("bot review verdict", { taskId: task.id, approved: verdict.approved, notes: verdict.notes });
    return verdict;
  }

  /** Last commit's stat + diff; falls back to `git show HEAD` on the first commit. */
  private async collectDiff(workspace: string): Promise<{ stat: string; diff: string }> {
    const statRes = await git(["show", "--stat", "HEAD"], workspace);
    const diffRes = await git(["diff", "HEAD~1", "HEAD"], workspace);
    let diffText: string;
    if (diffRes.code === 0) {
      diffText = diffRes.stdout;
    } else {
      // HEAD~1 does not exist (first commit) — show the whole commit instead.
      const showRes = await git(["show", "HEAD"], workspace);
      diffText = showRes.stdout;
    }
    return { stat: cap(statRes.stdout, MAX_DIFF_CHARS), diff: cap(diffText, MAX_DIFF_CHARS) };
  }
}
