import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Run, RunConfig, Task, TaskStatus, AgentResult, JournalEvent } from "./types.js";

/**
 * Durable state store. SQLite in WAL mode = crash-safe, ACID transactions.
 *
 * Every state change goes through a transaction that updates the task row AND
 * appends a journal event atomically, so a crash can never leave the two out of
 * sync. On restart the Conductor reads current state directly (the rows ARE the
 * resumable state) and the journal is the audit/debug trail.
 */
export class Store {
  private db: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        prd_path TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL,
        cost_spent REAL NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        acceptance TEXT NOT NULL,
        deps TEXT NOT NULL,
        files TEXT NOT NULL,
        user_visible INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        assignee TEXT,
        branch TEXT,
        result TEXT,
        error TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_run ON tasks(run_id, status);
      CREATE TABLE IF NOT EXISTS journal (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_journal_run ON journal(run_id, seq);
      CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        rule TEXT NOT NULL,
        source_task TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(run_id, rule)
      );
    `);
    // Additive migration for stores created before linear_issue_id existed.
    const cols = this.db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[];
    if (!cols.some((c) => c.name === "linear_issue_id")) {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN linear_issue_id TEXT`);
    }
  }

  // ---- runs ---------------------------------------------------------------

  createRun(run: Run): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, prd_path, repo_path, goal, status, cost_spent, config, created_at)
         VALUES (@id, @prdPath, @repoPath, @goal, @status, @costSpent, @config, @createdAt)`,
      )
      .run({ ...run, config: JSON.stringify(run.config) });
  }

  getRun(id: string): Run | null {
    const row = this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRow | undefined;
    return row ? rowToRun(row) : null;
  }

  setRunStatus(id: string, status: Run["status"]): void {
    this.db.prepare(`UPDATE runs SET status = ? WHERE id = ?`).run(status, id);
  }

  addCost(id: string, tokens: number): number {
    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE runs SET cost_spent = cost_spent + ? WHERE id = ?`).run(tokens, id);
      return (this.db.prepare(`SELECT cost_spent FROM runs WHERE id = ?`).get(id) as { cost_spent: number }).cost_spent;
    });
    return tx();
  }

  // ---- tasks --------------------------------------------------------------

  insertTasks(tasks: Task[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO tasks (id, run_id, title, description, acceptance, deps, files, user_visible, status, attempts, assignee, branch, result, error, linear_issue_id, updated_at)
       VALUES (@id, @runId, @title, @description, @acceptance, @deps, @files, @userVisible, @status, @attempts, @assignee, @branch, @result, @error, @linearIssueId, @updatedAt)`,
    );
    const tx = this.db.transaction((rows: Task[]) => {
      for (const t of rows) stmt.run(taskToRow(t));
    });
    tx(tasks);
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  listTasks(runId: string): Task[] {
    const rows = this.db.prepare(`SELECT * FROM tasks WHERE run_id = ? ORDER BY id`).all(runId) as TaskRow[];
    return rows.map(rowToTask);
  }

  /**
   * Atomically transition a task and append a journal event. The two happen in
   * one transaction, so a crash leaves them consistent.
   */
  transition(
    taskId: string,
    patch: Partial<Pick<Task, "status" | "attempts" | "assignee" | "branch" | "result" | "error">>,
    eventType: string,
  ): void {
    const tx = this.db.transaction(() => {
      const task = this.getTask(taskId);
      if (!task) throw new Error(`transition: unknown task ${taskId}`);
      const next: Task = {
        ...task,
        ...patch,
        updatedAt: Date.now(),
      };
      this.db
        .prepare(
          `UPDATE tasks SET status=@status, attempts=@attempts, assignee=@assignee, branch=@branch, result=@result, error=@error, updated_at=@updatedAt WHERE id=@id`,
        )
        .run(taskToRow(next));
      this.appendJournalInTx(task.runId, eventType, { taskId, patch });
    });
    tx();
  }

  /** Record the Linear issue mirroring a task (persisted, survives restarts). */
  setLinearIssue(taskId: string, issueId: string): void {
    this.db.prepare(`UPDATE tasks SET linear_issue_id = ? WHERE id = ?`).run(issueId, taskId);
  }

  /** Amend a task's description (e.g. appending a human change request). */
  amendDescription(taskId: string, description: string): void {
    this.db.prepare(`UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?`).run(description, Date.now(), taskId);
  }

  // ---- lessons --------------------------------------------------------------

  /** Add a durable lesson (deduped on exact rule text per run). */
  addLesson(runId: string, rule: string, sourceTask?: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO lessons (run_id, rule, source_task, created_at) VALUES (?, ?, ?, ?)`)
      .run(runId, rule, sourceTask ?? null, Date.now());
  }

  listLessons(runId: string): string[] {
    const rows = this.db.prepare(`SELECT rule FROM lessons WHERE run_id = ? ORDER BY id`).all(runId) as { rule: string }[];
    return rows.map((r) => r.rule);
  }

  // ---- journal ------------------------------------------------------------

  private appendJournalInTx(runId: string, type: string, payload: unknown): void {
    this.db
      .prepare(`INSERT INTO journal (run_id, ts, type, payload) VALUES (?, ?, ?, ?)`)
      .run(runId, Date.now(), type, JSON.stringify(payload ?? null));
  }

  appendJournal(runId: string, type: string, payload: unknown): void {
    this.appendJournalInTx(runId, type, payload);
  }

  readJournal(runId: string): JournalEvent[] {
    const rows = this.db
      .prepare(`SELECT seq, run_id, ts, type, payload FROM journal WHERE run_id = ? ORDER BY seq`)
      .all(runId) as JournalRow[];
    return rows.map((r) => ({ seq: r.seq, runId: r.run_id, ts: r.ts, type: r.type, payload: JSON.parse(r.payload) }));
  }

  close(): void {
    this.db.close();
  }
}

// ---- row mapping ----------------------------------------------------------

interface RunRow {
  id: string;
  prd_path: string;
  repo_path: string;
  goal: string;
  status: string;
  cost_spent: number;
  config: string;
  created_at: number;
}
interface TaskRow {
  id: string;
  run_id: string;
  title: string;
  description: string;
  acceptance: string;
  deps: string;
  files: string;
  user_visible: number;
  status: string;
  attempts: number;
  assignee: string | null;
  branch: string | null;
  result: string | null;
  error: string | null;
  linear_issue_id: string | null;
  updated_at: number;
}
interface JournalRow {
  seq: number;
  run_id: string;
  ts: number;
  type: string;
  payload: string;
}

function rowToRun(r: RunRow): Run {
  return {
    id: r.id,
    prdPath: r.prd_path,
    repoPath: r.repo_path,
    goal: r.goal,
    status: r.status as Run["status"],
    costSpent: r.cost_spent,
    config: JSON.parse(r.config) as RunConfig,
    createdAt: r.created_at,
  };
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    runId: r.run_id,
    title: r.title,
    description: r.description,
    acceptance: JSON.parse(r.acceptance),
    deps: JSON.parse(r.deps),
    files: JSON.parse(r.files),
    userVisible: r.user_visible === 1,
    status: r.status as TaskStatus,
    attempts: r.attempts,
    assignee: r.assignee,
    branch: r.branch,
    result: r.result ? (JSON.parse(r.result) as AgentResult) : null,
    error: r.error,
    linearIssueId: r.linear_issue_id,
    updatedAt: r.updated_at,
  };
}

function taskToRow(t: Task): Record<string, unknown> {
  return {
    id: t.id,
    runId: t.runId,
    title: t.title,
    description: t.description,
    acceptance: JSON.stringify(t.acceptance),
    deps: JSON.stringify(t.deps),
    files: JSON.stringify(t.files),
    userVisible: t.userVisible ? 1 : 0,
    status: t.status,
    attempts: t.attempts,
    assignee: t.assignee,
    branch: t.branch,
    result: t.result ? JSON.stringify(t.result) : null,
    error: t.error,
    linearIssueId: t.linearIssueId,
    updatedAt: t.updatedAt,
  };
}
