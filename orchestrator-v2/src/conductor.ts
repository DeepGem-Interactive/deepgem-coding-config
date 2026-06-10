import type { Store } from "./store.js";
import type { AgentRunner } from "./agent.js";
import type { LinearSync } from "./linear.js";
import type { WorktreeManager } from "./worktree.js";
import { runGates, gatesPassed, firstFailure } from "./gates.js";
import type { Run, Task, TaskSpec, RunConfig } from "./types.js";
import { TERMINAL_STATUSES } from "./types.js";
import { log } from "./logger.js";

export interface Reviewer {
  /** Automated bot review. Returns approved + notes. */
  review(task: Task, workspace: string): Promise<{ approved: boolean; notes: string }>;
}

/** Default bot reviewer: gates already passed, so approve. A real reviewer agent
 *  (diff + design-fidelity) plugs in here without touching the state machine. */
export class AutoApproveReviewer implements Reviewer {
  async review(): Promise<{ approved: boolean; notes: string }> {
    return { approved: true, notes: "gates green" };
  }
}

export interface ConductorDeps {
  store: Store;
  runner: AgentRunner;
  linear: LinearSync;
  worktrees: WorktreeManager;
  reviewer?: Reviewer;
  lessons?: string[];
}

export type StopReason = "complete" | "awaiting_human" | "cost_cap";

export interface LoopOutcome {
  stopReason: StopReason;
  stats: { done: number; dead: number; humanReview: number; blocked: number };
}

/**
 * Deterministic control plane. Owns the task state machine; uses LLMs only at
 * the leaves (the worker runner). All state lives in the Store, so the loop is
 * fully resumable: construct a Conductor for an existing run and call run().
 */
export class Conductor {
  private store: Store;
  private runner: AgentRunner;
  private linear: LinearSync;
  private worktrees: WorktreeManager;
  private reviewer: Reviewer;
  private lessons: string[];
  private mergeChain: Promise<void> = Promise.resolve(); // serializes merges

  constructor(
    private runId: string,
    deps: ConductorDeps,
  ) {
    this.store = deps.store;
    this.runner = deps.runner;
    this.linear = deps.linear;
    this.worktrees = deps.worktrees;
    this.reviewer = deps.reviewer ?? new AutoApproveReviewer();
    this.lessons = deps.lessons ?? [];
  }

  private run(): Run {
    const r = this.store.getRun(this.runId);
    if (!r) throw new Error(`unknown run ${this.runId}`);
    return r;
  }

  private cfg(): RunConfig {
    return this.run().config;
  }

  /** Main loop. Resumable and crash-safe — derives everything from the store. */
  async execute(): Promise<LoopOutcome> {
    await this.worktrees.ensureIntegrationBranch(this.cfg().integrationBranch);
    this.recoverOrphans();

    const running = new Map<string, Promise<void>>();
    const concurrency = this.cfg().concurrency;

    while (true) {
      this.promoteReady();

      // Fill idle capacity with non-conflicting ready tasks (fan-out).
      while (running.size < concurrency && this.underCostCap()) {
        const next = this.pickReady([...running.keys()]);
        if (!next) break;
        this.claim(next);
        const p = this.runTask(next).finally(() => running.delete(next.id));
        running.set(next.id, p);
      }

      if (running.size === 0) {
        // Nothing in flight. Either we're done, paused on cost, or waiting on a human.
        if (!this.underCostCap() && this.countByStatus("ready") + this.countByStatus("pending") > 0) {
          return this.finish("cost_cap");
        }
        const waiting = this.countByStatus("human_review") + this.countByStatus("blocked");
        const remaining = this.countByStatus("ready") + this.countByStatus("pending") + this.countByStatus("in_progress");
        if (remaining === 0) return this.finish(waiting > 0 ? "awaiting_human" : "complete");
        // remaining>0 but nothing runnable (e.g. all blocked on a human dep) → stop.
        return this.finish("awaiting_human");
      }

      // Wait for at least one in-flight task to settle, then re-evaluate.
      await Promise.race(running.values());
    }
  }

  // ---- recovery & scheduling ----------------------------------------------

  /** Crash recovery: a task left `in_progress` was killed mid-flight. Reset it
   *  to `ready` so it re-runs cleanly (its worktree is recreated). Completed
   *  tasks stay `done` — 0 lost, 0 duplicated. */
  private recoverOrphans(): void {
    for (const t of this.tasks()) {
      if (t.status === "in_progress") {
        this.store.transition(t.id, { status: "ready", assignee: null }, "recover_orphan");
        log.warn("recovered orphaned task → ready", { task: t.id });
      }
    }
  }

  /** Promote pending tasks whose deps are satisfied; cascade dead deps. */
  private promoteReady(): void {
    const byId = new Map(this.tasks().map((t) => [t.id, t]));
    for (const t of this.tasks()) {
      if (t.status !== "pending") continue;
      const deps = t.deps.map((d) => byId.get(d));
      if (deps.some((d) => d?.status === "dead")) {
        this.store.transition(t.id, { status: "dead", error: "a dependency was dead-lettered" }, "dep_dead");
        continue;
      }
      // A dep counts as satisfied once it's merged into integration (human_review or done).
      const satisfied = deps.every((d) => d && (d.status === "human_review" || d.status === "done"));
      if (satisfied) {
        this.store.transition(t.id, { status: "ready" }, "promote_ready");
        void this.linear.setStatus({ ...t, status: "ready" }, "ready");
      }
    }
  }

  /** Pick a ready task whose files don't overlap any in-flight task's files. */
  private pickReady(runningIds: string[]): Task | null {
    const inflightFiles = new Set<string>();
    for (const id of runningIds) {
      const t = this.store.getTask(id);
      t?.files.forEach((f) => inflightFiles.add(f));
    }
    for (const t of this.tasks()) {
      if (t.status !== "ready") continue;
      if (t.files.some((f) => inflightFiles.has(f))) continue; // parallel-safety
      return t;
    }
    return null;
  }

  private claim(t: Task): void {
    const name = t.assignee ?? "worker";
    this.store.transition(t.id, { status: "in_progress", assignee: name }, "claim");
    void this.linear.setStatus({ ...t, status: "in_progress" }, "in_progress");
  }

  // ---- task execution ------------------------------------------------------

  /** Execute one task end-to-end. A THROWN error here = a crash (propagates and
   *  aborts the loop, leaving the task `in_progress` for recovery on resume). A
   *  handled failure (bad result / failed gate) increments attempts and retries
   *  or dead-letters — it never throws. */
  private async runTask(task: Task): Promise<void> {
    const cfg = this.cfg();
    const wt = await this.worktrees.create(task.id, cfg.integrationBranch);
    try {
      const spec = this.toSpec(task);
      const result = await this.runner.run(spec, wt.path); // may THROW = crash
      this.store.addCost(this.runId, result.costTokens);

      if (!result.ok) return this.fail(task, result.error ?? "worker reported failure");

      const committed = await this.worktrees.commit(wt.path, `${task.title}\n\n[${task.assignee}] ${task.id}`);
      if (!committed) return this.fail(task, "worker produced no changes");

      const gateResults = await runGates(cfg.gates, wt.path, cfg.taskTimeoutMs);
      if (!gatesPassed(gateResults)) {
        const f = firstFailure(gateResults)!;
        return this.fail(task, `gate '${f.name}' failed`);
      }

      // Merge into integration (serialized).
      const merge = await this.serializeMerge(() => this.worktrees.merge(wt.branch, cfg.integrationBranch));
      if (!merge.ok) {
        if (merge.conflict) {
          this.store.transition(task.id, { status: "blocked", branch: wt.branch, error: "merge conflict" }, "merge_conflict");
          void this.linear.comment({ ...task, status: "blocked" }, `Merge conflict on ${wt.branch}. Needs a human.`);
          return;
        }
        return this.fail(task, `merge failed: ${merge.detail}`);
      }

      // Bot review.
      this.store.transition(task.id, { status: "bot_review", branch: wt.branch, result }, "bot_review");
      void this.linear.setStatus({ ...task, status: "bot_review" }, "bot_review");
      const review = await this.reviewer.review(task, wt.path);
      if (!review.approved) return this.fail(task, `bot review rejected: ${review.notes}`);

      // Gate to the human (user-visible) or auto-complete (backend).
      const finalStatus = task.userVisible ? "human_review" : "done";
      this.store.transition(task.id, { status: finalStatus, result }, finalStatus);
      void this.linear.setStatus({ ...task, status: finalStatus }, finalStatus);
      log.info(`task ${finalStatus}`, { task: task.id, title: task.title });
    } finally {
      await this.worktrees.remove(wt.path, wt.branch).catch(() => {});
    }
  }

  /** Handled failure: retry until maxAttempts, then dead-letter. Never throws. */
  private fail(task: Task, reason: string): void {
    const attempts = task.attempts + 1;
    const max = this.cfg().maxAttempts;
    if (attempts >= max) {
      this.store.transition(task.id, { status: "dead", attempts, error: reason }, "dead_letter");
      void this.linear.comment({ ...task, status: "dead" }, `Dead-lettered after ${attempts} attempts: ${reason}`);
      log.error("task dead-lettered", { task: task.id, attempts, reason });
    } else {
      this.store.transition(task.id, { status: "ready", attempts, assignee: null, error: reason }, "retry");
      log.warn("task retry", { task: task.id, attempts, reason });
    }
  }

  private serializeMerge<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mergeChain.then(fn, fn);
    this.mergeChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private toSpec(task: Task): TaskSpec {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      acceptance: task.acceptance,
      files: task.files,
      assignee: task.assignee ?? "worker",
      lessons: this.lessons,
    };
  }

  // ---- helpers -------------------------------------------------------------

  private tasks(): Task[] {
    return this.store.listTasks(this.runId);
  }
  private countByStatus(status: Task["status"]): number {
    return this.tasks().filter((t) => t.status === status).length;
  }
  private underCostCap(): boolean {
    const cap = this.cfg().costCap;
    return cap === null || this.run().costSpent < cap;
  }

  private finish(stopReason: StopReason): LoopOutcome {
    const stats = {
      done: this.countByStatus("done"),
      dead: this.countByStatus("dead"),
      humanReview: this.countByStatus("human_review"),
      blocked: this.countByStatus("blocked"),
    };
    const runStatus = stopReason === "complete" ? "complete" : stopReason === "awaiting_human" ? "awaiting_human" : "active";
    this.store.setRunStatus(this.runId, runStatus);
    this.store.appendJournal(this.runId, "loop_stop", { stopReason, stats });
    const allTerminalOrWaiting = this.tasks().every(
      (t) => TERMINAL_STATUSES.includes(t.status) || t.status === "human_review" || t.status === "blocked",
    );
    log.info("loop stop", { stopReason, ...stats, settled: allTerminalOrWaiting });
    return { stopReason, stats };
  }
}
