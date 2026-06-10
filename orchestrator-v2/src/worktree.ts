import { rm } from "node:fs/promises";
import { join } from "node:path";
import { git } from "./exec.js";
import { log } from "./logger.js";

/**
 * Per-worker isolation via git worktrees. Each task gets its own worktree on its
 * own branch, so parallel workers physically cannot touch each other's files.
 * The Conductor merges completed branches into the integration branch
 * deterministically; a merge conflict is surfaced as data, never a silent
 * corruption.
 */
export class WorktreeManager {
  constructor(
    private repoPath: string,
    private root = join(repoPath, ".dgorch", "worktrees"),
  ) {}

  /** Ensure the integration branch exists (branched from current HEAD). */
  async ensureIntegrationBranch(branch: string): Promise<void> {
    const exists = await git(["rev-parse", "--verify", branch], this.repoPath);
    if (exists.code !== 0) {
      const r = await git(["branch", branch], this.repoPath);
      if (r.code !== 0) throw new Error(`could not create integration branch ${branch}: ${r.stderr}`);
      log.info("created integration branch", { branch });
    }
  }

  /** Create an isolated worktree for a task, based on the integration branch. */
  async create(taskId: string, base: string): Promise<{ path: string; branch: string }> {
    const branch = `orchestrator/task-${taskId}`;
    const path = join(this.root, taskId);
    // Clean any stale worktree/branch from a previous (crashed) attempt.
    await this.remove(path, branch).catch(() => {});
    const r = await git(["worktree", "add", "-B", branch, path, base], this.repoPath);
    if (r.code !== 0) throw new Error(`worktree add failed for ${taskId}: ${r.stderr}`);
    return { path, branch };
  }

  /** Commit all changes in a worktree. Returns false if nothing changed. */
  async commit(worktreePath: string, message: string): Promise<boolean> {
    await git(["add", "-A"], worktreePath);
    const status = await git(["status", "--porcelain"], worktreePath);
    if (!status.stdout.trim()) return false;
    const r = await git(["commit", "-m", message], worktreePath);
    return r.code === 0;
  }

  /**
   * Merge a task branch into the integration branch. Returns conflict=true (and
   * aborts the merge) if it doesn't apply cleanly.
   */
  async merge(branch: string, integration: string): Promise<{ ok: boolean; conflict: boolean; detail: string }> {
    // Operate on the main repo (integration branch is checked out there is not
    // guaranteed; use a detached merge via `git merge` after checkout).
    const co = await git(["checkout", integration], this.repoPath);
    if (co.code !== 0) return { ok: false, conflict: false, detail: `checkout ${integration} failed: ${co.stderr}` };
    const m = await git(["merge", "--no-ff", "-m", `merge ${branch}`, branch], this.repoPath);
    if (m.code === 0) return { ok: true, conflict: false, detail: "merged" };
    const conflict = /conflict/i.test(m.stdout + m.stderr);
    if (conflict) await git(["merge", "--abort"], this.repoPath);
    return { ok: false, conflict, detail: (m.stdout + m.stderr).slice(-2000) };
  }

  /** Tear down a worktree and delete its branch. */
  async remove(worktreePath: string, branch?: string): Promise<void> {
    await git(["worktree", "remove", "--force", worktreePath], this.repoPath).catch(() => {});
    await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
    await git(["worktree", "prune"], this.repoPath).catch(() => {});
    if (branch) await git(["branch", "-D", branch], this.repoPath).catch(() => {});
  }
}
