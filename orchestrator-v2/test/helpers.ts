import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Task } from "../src/types.js";

/** Make a throwaway git repo with one commit; returns its path. */
export function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dgorch-"));
  const g = (args: string[]) => execFileSync("git", args, { cwd: dir });
  g(["init", "-q", "-b", "main"]);
  g(["config", "user.email", "test@dgorch.local"]);
  g(["config", "user.name", "dgorch test"]);
  writeFileSync(join(dir, "README.md"), "# fixture\n");
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "init"]);
  return dir;
}

let counter = 0;
/** Build a Task with sane defaults and a distinct file scope. */
export function task(runId: string, over: Partial<Task> = {}): Task {
  counter += 1;
  const id = over.id ?? randomUUID();
  return {
    id,
    runId,
    title: over.title ?? `Task ${counter}`,
    description: over.description ?? "do the thing",
    acceptance: over.acceptance ?? ["it is done"],
    deps: over.deps ?? [],
    files: over.files ?? [`src/gen/${id}.ts`],
    userVisible: over.userVisible ?? false,
    status: over.status ?? "pending",
    attempts: over.attempts ?? 0,
    assignee: over.assignee ?? "Bender",
    branch: over.branch ?? null,
    result: over.result ?? null,
    error: over.error ?? null,
    updatedAt: Date.now(),
  };
}
