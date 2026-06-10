import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Task } from "./types.js";
import { log } from "./logger.js";

/** A planner turns a PRD + goal into a dependency-ordered set of tasks. */
export interface Planner {
  plan(prd: string, goal: string, runId: string): Promise<Task[]>;
}

const PlannedTask = z.object({
  key: z.string().describe("short stable id, e.g. T1"),
  title: z.string(),
  description: z.string(),
  acceptance: z.array(z.string()).min(1),
  deps: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  userVisible: z.boolean().default(false),
});
const PlanSchema = z.object({ tasks: z.array(PlannedTask).min(1) });
export type Plan = z.infer<typeof PlanSchema>;

/** Convert a validated plan into engine Task rows with real ids + resolved deps. */
export function planToTasks(plan: Plan, runId: string): Task[] {
  const idByKey = new Map<string, string>();
  for (const t of plan.tasks) idByKey.set(t.key, randomUUID());
  const now = Date.now();
  return plan.tasks.map((t) => ({
    id: idByKey.get(t.key)!,
    runId,
    title: t.title,
    description: t.description,
    acceptance: t.acceptance,
    deps: t.deps.map((d) => idByKey.get(d)).filter((x): x is string => Boolean(x)),
    files: t.files,
    userVisible: t.userVisible,
    status: "pending",
    attempts: 0,
    assignee: null,
    branch: null,
    result: null,
    error: null,
    updatedAt: now,
  }));
}

/** Test/dry-run planner: takes a literal plan, validates, converts. */
export class FakePlanner implements Planner {
  constructor(private literalPlan: Plan) {}
  async plan(_prd: string, _goal: string, runId: string): Promise<Task[]> {
    return planToTasks(PlanSchema.parse(this.literalPlan), runId);
  }
}

/**
 * Real planner backed by the Agent SDK with structured output. Asks Claude to
 * decompose the PRD into independent, dependency-aware tasks and validates the
 * result against PlanSchema (retrying on malformed output).
 */
export class SdkPlanner implements Planner {
  constructor(private model?: string) {}

  async plan(prd: string, goal: string, runId: string): Promise<Task[]> {
    let query: any;
    try {
      ({ query } = await import("@anthropic-ai/claude-agent-sdk"));
    } catch (e) {
      throw new Error("Agent SDK not installed; use --fake or install @anthropic-ai/claude-agent-sdk. " + String(e));
    }
    const prompt = [
      `Decompose this work into a set of independent, parallelizable coding tasks.`,
      `Goal: ${goal}`,
      ``,
      `PRD:`,
      prd.slice(0, 50_000),
      ``,
      `Return ONLY JSON matching: { "tasks": [ { "key", "title", "description",`,
      `"acceptance": [string], "deps": [key], "files": [path], "userVisible": bool } ] }.`,
      `Keep tasks small and non-overlapping in files where possible. Order by dependency.`,
    ].join("\n");

    let raw = "";
    for await (const msg of query({ prompt, options: { permissionMode: "bypassPermissions", ...(this.model ? { model: this.model } : {}) } }) as AsyncIterable<{
      type: string;
      result?: string;
    }>) {
      if (msg.type === "result" && typeof msg.result === "string") raw = msg.result;
    }
    const json = extractJson(raw);
    const parsed = PlanSchema.parse(json);
    log.info("planner produced tasks", { count: parsed.tasks.length });
    return planToTasks(parsed, runId);
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("planner returned no JSON object");
  return JSON.parse(body.slice(start, end + 1));
}
