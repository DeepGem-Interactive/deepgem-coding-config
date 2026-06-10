import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { AgentResult, TaskSpec } from "./types.js";
import { log } from "./logger.js";

/**
 * The data plane. A worker executes one task in an isolated workspace and
 * returns STRUCTURED data — never terminal text to be scraped.
 *
 * The Conductor depends only on this interface, so the durable control plane is
 * fully testable offline with FakeAgentRunner, and the real Agent SDK is a
 * swappable adapter.
 */
export interface AgentRunner {
  run(spec: TaskSpec, workspace: string): Promise<AgentResult>;
}

/** Build the self-contained prompt for a worker. No outside context required. */
export function buildWorkerPrompt(spec: TaskSpec): string {
  const lessons = spec.lessons.length
    ? `\n\nLessons learned on this project (honor them):\n${spec.lessons.map((l) => `- ${l}`).join("\n")}`
    : "";
  const files = spec.files.length ? `\n\nFiles in scope (stay within these):\n${spec.files.map((f) => `- ${f}`).join("\n")}` : "";
  return [
    `You are ${spec.assignee}, a worker on an autonomous coding crew.`,
    `Task: ${spec.title}`,
    ``,
    spec.description,
    ``,
    `Done when:`,
    ...spec.acceptance.map((a) => `- ${a}`),
    files,
    lessons,
    ``,
    `Make the change, keep it minimal and consistent with the surrounding code,`,
    `and stop when every "Done when" item is satisfied.`,
  ].join("\n");
}

/**
 * Real worker, backed by the Claude Agent SDK. Lazy-imported so the package is
 * optional and the rest of the system builds/tests without it.
 */
export class SdkAgentRunner implements AgentRunner {
  constructor(private model?: string) {}

  async run(spec: TaskSpec, workspace: string): Promise<AgentResult> {
    let query: unknown;
    try {
      ({ query } = await import("@anthropic-ai/claude-agent-sdk"));
    } catch (e) {
      throw new Error(
        "Agent SDK not installed. `npm i @anthropic-ai/claude-agent-sdk`, or run with --fake for a dry run. " +
          String(e),
      );
    }
    const prompt = buildWorkerPrompt(spec);
    const filesChanged = new Set<string>();
    let costTokens = 0;
    let summary = "";
    let ok = true;
    let error: string | undefined;

    // The SDK streams messages; we run the agent inside the isolated workspace
    // with edit tools enabled, and collect a structured result.
    const iterator = (query as (a: {
      prompt: string;
      options: Record<string, unknown>;
    }) => AsyncIterable<SdkMessage>)({
      prompt,
      options: {
        cwd: workspace,
        permissionMode: "bypassPermissions",
        ...(this.model ? { model: this.model } : {}),
      },
    });

    try {
      for await (const msg of iterator) {
        if (msg.type === "assistant" && typeof msg.text === "string") summary = msg.text;
        if (msg.type === "tool_use" && msg.name && /edit|write/i.test(msg.name) && msg.input?.file_path) {
          filesChanged.add(String(msg.input.file_path));
        }
        if (msg.type === "result") {
          costTokens = msg.usage?.output_tokens ?? 0;
          if (msg.subtype && msg.subtype !== "success") {
            ok = false;
            error = `agent ended: ${msg.subtype}`;
          }
          if (typeof msg.result === "string" && msg.result) summary = msg.result;
        }
      }
    } catch (e) {
      ok = false;
      error = String(e);
    }

    return { ok, summary: summary || "(no summary)", filesChanged: [...filesChanged], costTokens, error };
  }
}

interface SdkMessage {
  type: string;
  subtype?: string;
  text?: string;
  name?: string;
  input?: { file_path?: string };
  result?: string;
  usage?: { output_tokens?: number };
}

/**
 * Deterministic fake worker for tests and dry runs. Simulates doing the work by
 * writing a marker file, and can be told to fail a given task id N times to
 * exercise retries / dead-lettering.
 */
export class FakeAgentRunner implements AgentRunner {
  /** taskId -> number of times to fail before succeeding. */
  private failuresLeft = new Map<string, number>();
  /** taskIds that should always fail (to test dead-letter). */
  private alwaysFail = new Set<string>();
  /** taskIds that should THROW (simulate a process crash mid-task). */
  private throwOn = new Set<string>();
  /** Task ids this runner successfully executed (for assertions). */
  public readonly executed: string[] = [];

  constructor(opts: { failNTimes?: Record<string, number>; alwaysFail?: string[]; throwOn?: string[] } = {}) {
    for (const [id, n] of Object.entries(opts.failNTimes ?? {})) this.failuresLeft.set(id, n);
    for (const id of opts.alwaysFail ?? []) this.alwaysFail.add(id);
    for (const id of opts.throwOn ?? []) this.throwOn.add(id);
  }

  async run(spec: TaskSpec, workspace: string): Promise<AgentResult> {
    if (this.throwOn.has(spec.id)) throw new Error(`CRASH while running ${spec.id}`);
    if (this.alwaysFail.has(spec.id)) {
      return { ok: false, summary: "", filesChanged: [], costTokens: 10, error: "forced failure" };
    }
    const left = this.failuresLeft.get(spec.id) ?? 0;
    if (left > 0) {
      this.failuresLeft.set(spec.id, left - 1);
      return { ok: false, summary: "", filesChanged: [], costTokens: 10, error: `simulated failure (${left} left)` };
    }
    // "Do the work": write a deterministic marker file inside the workspace.
    const rel = spec.files[0] ?? `done/${spec.id}.txt`;
    const abs = join(workspace, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `completed by ${spec.assignee}: ${spec.title}\n`);
    this.executed.push(spec.id);
    log.debug("fake worker completed", { task: spec.id, file: rel });
    return { ok: true, summary: `Completed: ${spec.title}`, filesChanged: [rel], costTokens: 100 };
  }
}
