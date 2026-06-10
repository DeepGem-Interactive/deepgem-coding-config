#!/usr/bin/env node
import { Command } from "commander";
import { startRun, resumeRun, serveRun, statusReport } from "./bootstrap.js";
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
  .command("serve")
  .description("Long-running mode: execute the run and keep watching Linear for human verdicts")
  .requiredOption("--repo <path>", "git repo to work in")
  .option("--prd <path>", "PRD file (to start a new run)")
  .option("--run <id>", "existing run id (to resume in serve mode)")
  .option("--goal <text>", "one-line goal", "Implement the PRD")
  .option("--db <path>", "state db path")
  .option("--poll-sec <n>", "seconds between Linear verdict polls", (v) => parseInt(v, 10), 120)
  .option("--webhook-port <n>", "listen for Linear webhooks on this port", (v) => parseInt(v, 10))
  .option("--concurrency <n>", "max parallel workers", (v) => parseInt(v, 10))
  .option("--cost-cap <tokens>", "hard output-token ceiling", (v) => parseInt(v, 10))
  .option("--fake", "dry run with the fake worker", false)
  .option("--plan <path>", "literal task plan JSON (required with --fake)")
  .action(async (o) => {
    if (!o.prd && !o.run) throw new Error("serve needs --prd (new run) or --run (resume)");
    configureLogger({ jsonlPath: `${o.repo}/.dgorch/run.jsonl`, level: "info" });
    const { runId, outcome } = await serveRun({
      repoPath: o.repo,
      prdPath: o.prd ?? "",
      goal: o.goal,
      runId: o.run,
      dbPath: o.db,
      fake: o.fake,
      planPath: o.plan,
      pollSec: o.pollSec,
      webhookPort: o.webhookPort,
      webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
      configOverrides: {
        ...(o.concurrency ? { concurrency: o.concurrency } : {}),
        ...(o.costCap ? { costCap: o.costCap } : {}),
      },
    });
    process.stdout.write(`\nrun ${runId}\nserve stop: ${outcome.stopReason} after ${outcome.cycles} cycle(s)\n`);
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
