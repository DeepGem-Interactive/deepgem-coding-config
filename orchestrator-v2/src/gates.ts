import type { GateResult, GateSpec } from "./types.js";
import { sh } from "./exec.js";
import { log } from "./logger.js";

/**
 * Verification gates as code. Each gate is a shell command run in the worker's
 * workspace; pass/fail is the exit code, recorded structurally. The LLM never
 * decides whether the build passed — the build does.
 */
export async function runGates(gates: GateSpec[], workspace: string, timeoutMs: number): Promise<GateResult[]> {
  const results: GateResult[] = [];
  for (const gate of gates) {
    const r = await sh(gate.command, { cwd: workspace, timeoutMs });
    const passed = r.code === 0;
    results.push({
      name: gate.name,
      passed,
      output: (r.stdout + r.stderr).slice(-4000),
    });
    log[passed ? "debug" : "warn"](`gate ${gate.name}: ${passed ? "pass" : "FAIL"}`, { code: r.code });
    if (!passed) break; // stop at first failing gate
  }
  return results;
}

export function gatesPassed(results: GateResult[]): boolean {
  return results.every((r) => r.passed);
}

export function firstFailure(results: GateResult[]): GateResult | null {
  return results.find((r) => !r.passed) ?? null;
}
