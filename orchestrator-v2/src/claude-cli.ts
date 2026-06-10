import { spawn } from "node:child_process";
import { log } from "./logger.js";

/**
 * Single reliable path to Claude: shell out to the `claude` CLI in print mode.
 *
 * We deliberately do NOT use the Agent SDK's query() wrapper — it intermittently
 * corrupts tool-call messages ("tool_use ids must be unique" 400) and reports a
 * successful result while the agent's edits silently fail to land. The CLI is
 * the same engine without that broken layer; `--output-format json` gives us the
 * final text plus token usage for cost accounting.
 */
export interface ClaudeResult {
  ok: boolean;
  text: string;
  outputTokens: number;
  code: number;
}

export interface ClaudeOpts {
  /** Working directory the agent operates in (e.g. a worktree). */
  cwd?: string;
  /** Model override (defaults to the CLI's configured model). */
  model?: string;
  /** Kill the process after this many ms. */
  timeoutMs?: number;
  /** Allow file edits (worker). Reviewers/planners pass false → read-only-ish. */
  allowEdits?: boolean;
}

export function runClaude(prompt: string, opts: ClaudeOpts = {}): Promise<ClaudeResult> {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--permission-mode",
    opts.allowEdits === false ? "default" : "bypassPermissions",
  ];
  if (opts.model) args.push("--model", opts.model);

  return new Promise((resolve) => {
    // stdin "ignore" closes it immediately, avoiding the CLI's 3s stdin wait.
    const child = spawn("claude", args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let killed = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ ok: false, text: `failed to spawn claude: ${String(e)}`, outputTokens: 0, code: -1 });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (killed) {
        resolve({ ok: false, text: `claude timed out after ${opts.timeoutMs}ms`, outputTokens: 0, code: -1 });
        return;
      }
      let text = "";
      let tokens = 0;
      let isError = false;
      try {
        const j = JSON.parse(out) as { result?: unknown; usage?: { output_tokens?: number }; is_error?: boolean };
        text = typeof j.result === "string" ? j.result : out;
        tokens = j.usage?.output_tokens ?? 0;
        isError = Boolean(j.is_error);
      } catch {
        text = out.trim() || err.trim();
      }
      const ok = code === 0 && !isError;
      if (!ok) log.debug("claude cli non-ok", { code, isError, tail: text.slice(-160) });
      resolve({ ok, text, outputTokens: tokens, code: code ?? -1 });
    });
  });
}
