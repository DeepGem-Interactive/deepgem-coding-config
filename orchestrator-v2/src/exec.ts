import { execFile } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Promise wrapper around execFile with a timeout and captured output. */
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs ?? 0, env: opts.env ?? process.env, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: number }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
        resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() });
      },
    );
  });
}

/** Run a shell command string (via sh -c) — for project gate commands. */
export function sh(command: string, opts: { cwd?: string; timeoutMs?: number } = {}): Promise<ExecResult> {
  return run("/bin/sh", ["-c", command], opts);
}

/** git helper. */
export function git(args: string[], cwd: string, timeoutMs = 60_000): Promise<ExecResult> {
  return run("git", args, { cwd, timeoutMs });
}
