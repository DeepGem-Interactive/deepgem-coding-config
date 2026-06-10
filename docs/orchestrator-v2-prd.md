# PRD — Orchestrator v2: Durable Multi-Agent Coding Infrastructure

*DeepGem Interactive · drafted 2026-06-10 · status: draft for review*

## 1. One-line summary
Keep the human experience identical — install a plugin, hand it a PRD, review
cards in Linear, hear the crew — while replacing the brittle tmux-scraping engine
with a durable, crash-safe orchestration system that recovers itself and never
needs the human to babysit plumbing.

## 2. Why now (the honest problem)
v1 (the current `deepgem-coding-config` orchestrator) proved the *workflow* is
right: parallel agents, Linear as the human gate, bot-review → human-review,
design-fidelity and build gates, voice notes, a self-improving lessons loop.

But the *engine* is duct tape. The "Coordinator" is an LLM living in a tmux pane
that plans, **polls other panes, and parses terminal scrollback as text**, then
dispatches with `send-keys`. It is simultaneously the brain and the bus, and it
is fragile. A single session of real use hit: stale plugin installs, the wrong
Claude binary shadowing in tmux, pane-layout "no space" failures, quote-escaping
bugs, API-key/quota confusion, and attachment plumbing that silently fell back to
dead local links. None of those were *product* problems — they were all
infrastructure fragility. That fragility is the ceiling. v2 raises it.

## 3. Goals
- **Durable:** kill the process at any moment; resume with zero lost work and no
  double-work. Survive reboots, compaction, crashes.
- **Self-recovering:** timeouts, retries, and stuck-task handling are automatic;
  the human is involved only for product decisions, never for plumbing.
- **Structured, not scraped:** all agent I/O is schema-validated data, never
  terminal text parsing.
- **Parallel-safe:** agents work in isolation and can never clobber each other.
- **Observable & bounded:** always answerable — what is each agent doing, what
  has it cost, what's stuck — with hard caps on concurrency, cost, and time.
- **Portable:** runs the same on the laptop today and a cloud box later.

## 4. Non-goals
- Not changing the human workflow (see §5 — it's an invariant).
- Not replacing Linear as the human-facing tracker.
- Not (yet) a product for other teams. Internal infra first.
- Not a GUI. Linear + the plugin are the interface.

## 5. The UX invariant (must NOT change)
From Ziah's seat, v2 looks the same as v1:
1. Install/enable a plugin.
2. Point it at a PRD.
3. Review work in Linear — approve by moving to Done, reject by moving back with a
   one-line comment.
4. Hear the crew's voice notes; see screenshots/video on each card.

Everything in §6 is under the hood. If the human notices the rewrite at all, it
should only be because things stopped breaking.

## 6. Target architecture — split the control plane from the agents
v1's fatal flaw is that one LLM is both orchestrator and message bus. v2 separates
a **deterministic control plane** from an **LLM data plane**.

### 6.1 Conductor (control plane) — deterministic code, not an LLM
A long-running orchestration process that owns the task state machine:
scheduling, dependency resolution, retries, verification gates, merges, and Linear
sync. It is **code**, so it is predictable and resumable. It calls LLMs only for
judgment (decompose a PRD into tasks; review a diff; check a render match) via the
**Claude Agent SDK** with **schema-validated** inputs and outputs — no free-text
parsing. Because its state is persisted (§6.3), the Conductor can die and replay.

### 6.2 Workers (data plane) — ephemeral SDK agents
One Claude agent per task, spawned via the Agent SDK, each in an isolated
workspace (§6.4). It receives a structured task spec and returns a structured
result (files changed, build/test status, summary, artifacts). No tmux, no
`send-keys`, no scrollback scraping.

### 6.3 Durable state store — the real source of truth for the engine
A local durable store (SQLite + a durable-execution / journaling pattern) records
every task, status, attempt, artifact, and an orchestration journal. **Linear is a
human-facing mirror synced from this store**, not the engine's memory. On reboot
the Conductor replays the journal and resumes exactly where it stopped. Idempotent
steps guarantee no step runs twice.

### 6.4 Isolation + deterministic merge
Each worker runs in its own **git worktree** (Phase 3 option: container). Parallel
agents physically cannot touch each other's files. The Conductor merges completed
branches deterministically and runs the verification gate **at merge time**; a
conflict becomes a new task, never a silent corruption.

### 6.5 Verification gates as code
Build / typecheck / lint / test / design-fidelity run as deterministic steps with
structured pass/fail. The LLM supplies judgment ("does this screen match the
render?"), but the gate's verdict is recorded as data and is replayable.

### 6.6 Human gate — unchanged, but event-driven
Linear's Todo → In Progress → Bot Review → Human Review → Done pipeline stays.
The Conductor learns of human verdicts via **Linear webhooks**, not polling — so
no token-burning poll loop, and verdicts are picked up instantly.

### 6.7 Observability, cost, secrets
- **Observability:** structured logs + a live status view (agent → task, cost,
  retries, what's stuck).
- **Cost/usage caps:** hard ceilings per run so an overnight job can't exhaust the
  plan or stall silently; the Conductor pauses and reports at the cap.
- **Secrets:** keys (Linear, ElevenLabs) in one local secret store/env, never in
  chat, args, or git. Rotatable in one place.

## 7. Durability requirements (the "truly durable" checklist)
- [ ] Crash at any point → resume with 0 lost and 0 duplicated work.
- [ ] No agent I/O depends on parsing terminal output.
- [ ] Every task has timeout + bounded retries + a dead-letter path with a reason.
- [ ] Parallel agents cannot clobber each other (isolated workspaces).
- [ ] Hard caps on concurrency, cost, and per-task wall-clock.
- [ ] At any instant you can answer: what is each agent doing, what has it cost,
      what is stuck and why.
- [ ] Same behavior on laptop and a cloud box.

## 8. Migration phases (each ships alone; UX identical throughout)
- **Phase 1 — Kill the scraping.** Replace tmux + `send-keys` with Agent SDK
  agents returning structured results. Coordinator still LLM-driven, but no pane
  parsing. *Eliminates the largest class of v1 bugs for the least work.*
- **Phase 2 — Deterministic Conductor + durable state.** Extract orchestration
  into a code state machine backed by SQLite; Linear becomes a synced mirror;
  resume-by-replay.
- **Phase 3 — Isolation + deterministic merge.** Worktree per worker; merge-time
  gate; conflict-as-task.
- **Phase 4 — Event-driven + bounded.** Linear webhooks replace polling; add the
  live status view and hard cost/concurrency caps.
- **Phase 5 — Portability + hardening.** Containerize; cloud-box option;
  chaos-test crash recovery until §7 all passes.

## 9. Success metrics
- **Human plumbing time per session → ~0** (today: high).
- **% tasks completed without human infrastructure intervention → 95%+.**
- **Crash recovery:** kill mid-run → 0 lost / 0 duplicated tasks (automated test).
- **Parallel safety:** 0 lost-commit / clobber incidents across N parallel agents.
- **Overnight runs:** never exceed the cost cap, never stall silently.

## 10. Risks & mitigations
- **Rebuild trap / over-engineering** → strict phasing; every phase is usable on
  its own and keeps the UX identical. Stop whenever the marginal durability isn't
  worth it.
- **Agent SDK unknowns** → Phase 1 is a de-risking spike before committing the
  rest.
- **Solo maintenance burden** → adopt proven building blocks (Agent SDK, SQLite, a
  durable-execution lib) over bespoke code; less to maintain.
- **Always-on infra cost** → caps + laptop-first design; cloud only when it pays
  for itself.

## 11. Open decisions (for Ziah)
1. **Build target:** A) Agent SDK + lightweight durable state *(rec — fastest path
   off tmux)*; B) full workflow engine (Temporal-style) — sturdier, heavier.
2. **Isolation:** A) git worktrees *(rec — simple, enough for solo)*; B) containers
   — stronger, more setup.
3. **Hosting:** A) laptop-first *(rec for now)*; B) cloud box from day one — frees
   the Mac but adds ops.
