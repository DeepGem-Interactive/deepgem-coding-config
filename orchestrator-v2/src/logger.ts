// Minimal structured logger: pretty line to stderr + optional JSONL sink.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type Level = "debug" | "info" | "warn" | "error";

let jsonlPath: string | null = null;
let minLevel: Level = "info";
const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function configureLogger(opts: { jsonlPath?: string; level?: Level }): void {
  if (opts.jsonlPath) {
    jsonlPath = opts.jsonlPath;
    mkdirSync(dirname(jsonlPath), { recursive: true });
  }
  if (opts.level) minLevel = opts.level;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (order[level] < order[minLevel]) return;
  const ts = new Date().toISOString();
  const tag = { debug: "·", info: "•", warn: "⚠", error: "✗" }[level];
  const extra = fields && Object.keys(fields).length ? " " + JSON.stringify(fields) : "";
  process.stderr.write(`${tag} ${msg}${extra}\n`);
  if (jsonlPath) {
    try {
      appendFileSync(jsonlPath, JSON.stringify({ ts, level, msg, ...fields }) + "\n");
    } catch {
      /* logging must never throw */
    }
  }
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};
