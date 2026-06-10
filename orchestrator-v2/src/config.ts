import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateSpec, RunConfig } from "./types.js";

export const DEFAULT_CONFIG: RunConfig = {
  concurrency: 4,
  costCap: null,
  maxAttempts: 3,
  taskTimeoutMs: 20 * 60 * 1000, // 20 min
  integrationBranch: "orchestrator/integration",
  gates: [],
};

/**
 * Detect sensible verification gates for a repo. Today: Node/TS projects from
 * package.json scripts. Extensible per ecosystem.
 */
export function detectGates(repoPath: string): GateSpec[] {
  const pkgPath = join(repoPath, "package.json");
  if (!existsSync(pkgPath)) return [];
  let scripts: Record<string, string> = {};
  try {
    scripts = (JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {}) as Record<string, string>;
  } catch {
    return [];
  }
  const gates: GateSpec[] = [];
  if (scripts.typecheck) gates.push({ name: "typecheck", command: "npm run typecheck", incremental: true });
  else if (scripts.build) gates.push({ name: "build", command: "npm run build" });
  if (scripts.lint) gates.push({ name: "lint", command: "npm run lint", incremental: true });
  if (scripts.test) gates.push({ name: "test", command: "npm test" });
  return gates;
}

export function resolveConfig(repoPath: string, overrides: Partial<RunConfig> = {}): RunConfig {
  const gates = overrides.gates ?? detectGates(repoPath);
  return { ...DEFAULT_CONFIG, ...overrides, gates };
}
