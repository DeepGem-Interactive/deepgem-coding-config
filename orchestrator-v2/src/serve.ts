import type { Store } from "./store.js";
import type { ConductorDeps } from "./conductor.js";
import { Conductor, type LoopOutcome } from "./conductor.js";
import { loadLinearKey } from "./linear.js";
import { LinearVerdictSource, computeVerdicts, applyVerdicts, type VerdictSource } from "./verdicts.js";
import { startWebhookServer, type WebhookServer } from "./webhook.js";
import { log } from "./logger.js";

export interface ServeOptions {
  /** Seconds between Linear verdict polls while awaiting the human. */
  pollSec?: number;
  /** Optional Linear webhook listener; a webhook event triggers an immediate poll. */
  webhookPort?: number;
  webhookSecret?: string;
  /** Injectable for tests; defaults to the real Linear source (needs the key). */
  verdictSource?: VerdictSource;
  /** Hard stop after this many serve iterations (tests / safety). 0 = unbounded. */
  maxCycles?: number;
}

export interface ServeOutcome {
  stopReason: LoopOutcome["stopReason"] | "no_verdict_source" | "max_cycles";
  cycles: number;
}

/**
 * Long-running mode: execute the run; whenever the engine parks awaiting the
 * human, keep watching Linear (slow poll + optional webhook poke), apply
 * verdicts the moment they appear, and continue — until the run completes or
 * hits its cost cap. Noticing the human's input is the ENGINE's job.
 */
export async function serveLoop(
  store: Store,
  runId: string,
  deps: ConductorDeps,
  opts: ServeOptions = {},
): Promise<ServeOutcome> {
  const pollMs = (opts.pollSec ?? 120) * 1000;
  let poke: (() => void) | null = null;

  let webhook: WebhookServer | null = null;
  if (opts.webhookPort !== undefined) {
    webhook = await startWebhookServer({
      port: opts.webhookPort,
      secret: opts.webhookSecret,
      onEvent: (type) => {
        log.info("webhook event — polling Linear now", { type });
        poke?.();
      },
    });
    log.info("webhook listening", { port: webhook.port });
  }

  try {
    let cycles = 0;
    while (true) {
      cycles += 1;
      const outcome = await new Conductor(runId, deps).execute();
      if (outcome.stopReason === "complete") return { stopReason: "complete", cycles };
      if (outcome.stopReason === "cost_cap") {
        log.warn("cost cap reached — pausing; raise the cap and resume");
        return { stopReason: "cost_cap", cycles };
      }

      // awaiting_human — find the tasks parked on the human with Linear mirrors.
      const waiting = store
        .listTasks(runId)
        .filter((t) => (t.status === "human_review" || t.status === "blocked") && t.linearIssueId);
      if (waiting.length === 0) {
        log.warn("awaiting human but no tasks have Linear issues to watch — stopping");
        return { stopReason: "awaiting_human", cycles };
      }

      const source = opts.verdictSource ?? defaultSource();
      if (!source) return { stopReason: "no_verdict_source", cycles };

      if (opts.maxCycles && cycles >= opts.maxCycles) return { stopReason: "max_cycles", cycles };

      await sleepOrPoke(pollMs, (fn) => (poke = fn));
      poke = null;

      const ids = waiting.map((t) => t.linearIssueId!) as string[];
      const states = await source.fetchIssueStates(ids);
      const verdicts = computeVerdicts(waiting, states);
      if (verdicts.length > 0) {
        const counts = applyVerdicts(store, runId, verdicts);
        log.info("human verdicts applied", counts);
      } else {
        log.debug("no verdicts yet", { watching: ids.length });
      }
      // Loop: the Conductor re-executes — newly ready fix tasks run; if all
      // approved, the next execute() reports complete.
    }
  } finally {
    await webhook?.close().catch(() => {});
  }
}

function defaultSource(): VerdictSource | null {
  const key = loadLinearKey();
  if (!key) {
    log.warn("no Linear API key (LINEAR_API_KEY or ~/.dgorch/linear.key) — cannot watch for human verdicts");
    return null;
  }
  return new LinearVerdictSource(key);
}

/** Sleep up to ms, but wake immediately if the poke callback fires (webhook). */
function sleepOrPoke(ms: number, register: (fn: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      resolve();
    }
    register(done);
  });
}
