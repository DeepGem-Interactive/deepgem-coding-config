#!/usr/bin/env node
import { Command } from "commander";
import { startRun, resumeRun, statusReport } from "./bootstrap.js";
import { configureLogger, log } from "./logger.js";

const program = new Command();
program
  .name("dgorch")
  .description("Durable multi-agent coding orchestrator (Orchestrator v2)")
  .version("0.1.0");

program
  .command("run")
  .description("Plan a PRD into tasks and execute them to completion (or the human gate)")
  .requiredOption("--repo <path>", "git repo to work in")
  .requiredOption("--prd <path>", "path to the PRD file")
  .option("--goal <text>", "one-line goal", "Implement the PRD")
  .option("--db <path>", "state db path (default <repo>/.dgorch/state.sqlite)")
  .option("--concurrency <n>", "max parallel workers", (v) => parseInt(v, 10))
  .option("--cost-cap <tokens>", "hard output-token ceiling for the run", (v) => parseInt(v, 10))
  .option("--fake", "dry run with the deterministic fake worker (no LLM)", false)
  .option("--plan <path>", "literal task plan JSON (required with --fake)")
  .action(async (o) => {
    configureLogger({ jsonlPath: `${o.repo}/.dgorch/run.jsonl`, level: "info" });
    const { runId, outcome } = await startRun({
      repoPath: o.repo,
      prdPath: o.prd,
      goal: o.goal,
      dbPath: o.db,
      fake: o.fake,
      planPath: o.plan,
      configOverrides: {
        ...(o.concurrency ? { concurrency: o.concurrency } : {}),
        ...(o.costCap ? { costCap: o.costCap } : {}),
      },
    });
    log.info("run finished", { runId, stopReason: outcome.stopReason, ...outcome.stats });
    printOutcome(runId, outcome.stopReason, outcome.stats);
  });

program
  .command("resume")
  .description("Resume a run after a crash, reboot, or human review")
  .requiredOption("--repo <path>", "git repo")
  .requiredOption("--run <id>", "run id")
  .option("--db <path>", "state db path")
  .option("--fake", "dry run", false)
  .action(async (o) => {
    configureLogger({ jsonlPath: `${o.repo}/.dgorch/run.jsonl`, level: "info" });
    const { runId, outcome } = await resumeRun(o.repo, o.run, { fake: o.fake, dbPath: o.db });
    printOutcome(runId, outcome.stopReason, outcome.stats);
  });

program
  .command("status")
  .description("Show the status breakdown for a run")
  .requiredOption("--repo <path>", "git repo")
  .requiredOption("--run <id>", "run id")
  .option("--db <path>", "state db path")
  .action((o) => {
    const { run, tasks, byStatus } = statusReport(o.repo, o.run, o.db);
    process.stdout.write(`Run ${run.id} — ${run.status} — cost ${run.costSpent} tokens\n`);
    process.stdout.write(`Tasks: ${JSON.stringify(byStatus)}\n`);
    for (const t of tasks) process.stdout.write(`  ${t.status.padEnd(13)} ${t.title}\n`);
  });

function printOutcome(runId: string, stopReason: string, stats: Record<string, number>) {
  process.stdout.write(`\nrun ${runId}\nstop: ${stopReason}\n`);
  process.stdout.write(`done=${stats.done} dead=${stats.dead} humanReview=${stats.humanReview} blocked=${stats.blocked}\n`);
  if (stopReason === "awaiting_human") process.stdout.write(`→ review the Human Review items, then: dgorch resume --repo <repo> --run ${runId}\n`);
}

program.parseAsync(process.argv).catch((e) => {
  log.error("fatal", { error: String(e) });
  process.exitCode = 1;
});
