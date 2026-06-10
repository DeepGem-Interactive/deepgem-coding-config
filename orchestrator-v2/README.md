# Orchestrator v2 — Durable Multi-Agent Coding Engine

The durable engine behind the DeepGem orchestrator. Same human experience as the
tmux plugin (hand it a PRD, review in Linear), but the control plane is
deterministic, crash-safe code instead of an LLM scraping terminal panes.

See [`../docs/orchestrator-v2-prd.md`](../docs/orchestrator-v2-prd.md) for the why.

## The core idea
v1 used one LLM as both the brain **and** the message bus — planning, polling
panes, and parsing scrollback. v2 splits them:

- **Conductor** (`src/conductor.ts`) — deterministic control plane. Owns the task
  state machine: scheduling, dependency resolution, concurrency, retries,
  dead-lettering, merge serialization, cost caps. It is *code*, so it's
  predictable and resumable. It calls LLMs only at the leaves.
- **Workers** (`src/agent.ts`) — one ephemeral Claude agent (via the Agent SDK)
  per task, in an isolated git worktree, returning **structured data** — never
  scraped text. Swappable; a `FakeAgentRunner` drives the offline tests.
- **Store** (`src/store.ts`) — SQLite in WAL mode. Every state change updates the
  task row *and* appends a journal event in one transaction, so a crash can never
  desync them. The rows **are** the resumable state.
- **Worktrees** (`src/worktree.ts`) — per-worker isolation; the Conductor merges
  branches into the integration branch deterministically; a conflict becomes a
  blocked task, never a silent corruption.
- **Gates** (`src/gates.ts`) — build/typecheck/lint/test as code, structured
  pass/fail. The build decides if the build passed, not an LLM.
- **Linear** (`src/linear.ts`) — human-facing *mirror* of engine state, not the
  engine's memory. Offline `Noop` by default; `Real` over GraphQL when creds are
  set.

## Durability properties (all covered by tests)
- **Crash → resume with 0 lost / 0 duplicated work.** A task left `in_progress`
  by a kill is recovered to `ready` and re-run cleanly; completed tasks are never
  re-run. (`test/conductor.test.ts` → "DURABILITY")
- Transient failures retry up to `maxAttempts`, then dead-letter; dead deps
  cascade.
- Cost cap pauses the run with work remaining (resume after raising it).
- Dependency-ordered, file-scope-isolated scheduling.

```
npm install
npm run typecheck   # tsc, src + tests
npm test            # 8 tests incl. crash-recovery durability proof
npm run build       # → dist/index.js (the `dgorch` CLI)
```

## Usage
```bash
# Real run (needs the Agent SDK + ANTHROPIC creds; Linear optional via env):
dgorch run --repo /path/to/project --prd ./prd.md --goal "Implement v1.1"

# Dry run with the deterministic fake worker (no LLM) and a literal plan:
dgorch run --repo /tmp/demo --prd ./prd.md --fake --plan ./plan.json

# Resume after a crash, reboot, or human review:
dgorch resume --repo /path/to/project --run <run-id>

# Status:
dgorch status --repo /path/to/project --run <run-id>
```

Env: `LINEAR_API_KEY` + `LINEAR_TEAM_ID` (+ optional `LINEAR_PROJECT_ID`) enable
the real Linear mirror; `ORCH_WORKER_MODEL` / `ORCH_PLANNER_MODEL` pick models.

## Status vs. the PRD phases
- **Phase 1 (kill the scraping)** — done: workers are SDK agents returning
  structured results; no tmux/`send-keys`/scrollback anywhere.
- **Phase 2 (deterministic Conductor + durable state)** — done: SQLite store +
  journal, resume-by-state, idempotent transitions, crash-recovery test.
- **Phase 3 (isolation + deterministic merge)** — done: worktree-per-worker,
  serialized merges, conflict-as-blocked-task.
- **Phase 4 (event-driven + bounded)** — partial: cost caps + concurrency caps +
  JSONL logging in; Linear *webhook* intake (replace human-review polling) is the
  next slice.
- **Phase 5 (portability + hardening)** — next: containerized workers, cloud-box
  option, chaos tests.

### Notable seams for the next slices
- `Reviewer` (`src/conductor.ts`) — drop in a real bot-review agent (diff +
  design-fidelity) without touching the state machine; default auto-approves.
- `Planner` (`src/planner.ts`) — `SdkPlanner` decomposes a PRD with structured
  output; `FakePlanner` for tests.
- `LinearSync` — add webhook-driven verdict intake so the human gate is push, not
  poll.
