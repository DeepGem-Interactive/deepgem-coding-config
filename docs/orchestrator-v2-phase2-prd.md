# PRD — Orchestrator Phase 2: Bulletproof, In Your Pocket, With a Crew

*DeepGem Interactive · 2026-07-06 · status: ready to build (rev 2 — adversarial critique applied; see Annex D)*

## 1. One-liner
Take the proven v2 engine from "works once" to "trust it with real client work": close every audited failure mode, put updates and one-tap decisions on Ziah's phone, and replace the single bot reviewer with a small specialist panel — without adding a single new server.

## 2. Why now
The independent audit (2026-07-05) confirmed the architecture and found exactly what blocks real use: 3 P0s (merge touches the main repo; a rate limit dead-letters whole plans; no lock against double engines) plus a short P1 list. All fixes are contained. And the human loop still requires a desk — the missing piece for walk-away autonomy is the phone.

## 3. Principles (priority order)
1. **Simple.** One process, one SQLite file, markdown personas. No queues, no dashboards, no new infra. Every avoidable config var is a defect.
2. **Bulletproof.** Every audited failure mode gets a fix AND a chaos test. Kill it anywhere; it resumes with zero loss.
3. **Works really, really well.** Specialist review, one-tap decisions, hard bounds on every loop and every dollar.
4. **Linear is the human's source of truth.** The phone is a mirror + remote control — never load-bearing. Channel down = engine unaffected.

## 4. The three pillars

### Pillar A — Bulletproof core (the audit, closed)

| Fix | Mechanism | Milestone |
|---|---|---|
| Merges never touch your repo | Dedicated integration worktree at `.dgorch/integration`; main working tree never checked out/moved | **M1** |
| Rate limit = pause, not failure | Classify CLI errors (`rate_limit/auth/timeout/spawn/task`); infra errors consume **zero attempts**, run → `paused` + persisted `resumeAt`, auto-resume with backoff. New StopReason `paused`; `dgorch run` prints resume time and exits 0 | **M1** |
| One engine per repo | `.dgorch/serve.lock` (pid + 10s heartbeat); second engine exits <1s with clear error; stale locks stolen; `PRAGMA busy_timeout` | **M1** |
| Human-rejection loop bounded | `human_bounces` (never reset); 3rd bounce → `blocked` + Linear comment. Change-requests **replace** a delimited section; lessons injected capped at 20 | **M1** |
| Secrets can't merge | Commit denylist (`.env*`, `*.pem/key`, creds, >1MB); skips surfaced to reviewer | **M1** |
| Truncated review diffs can't auto-ship | Full `--stat` always; over-budget diff ⇒ task must exit via Human Review, never auto-`done` | **M1** |
| Verdicts can't misfire | Map Linear **state type** (completed/started/canceled); **verdict requires the issue to have MOVED from the state the engine parked it in** (persist parked state id; equal ⇒ skip) — kills the self-trigger recycle loop. Canceled ⇒ task `dead`. Bot comments carry `[dgorch]` sentinel + parked-time filter, never read back as human input | **M1** |
| Timeout edits never merge | SIGTERM → 10s → process-**group** SIGKILL; worktree reset before commit check | **M1** |
| Orphaned `claude` children killed | Child pids tracked; group-kill on exit signals and in `recoverOrphans` before worktrees are recreated | **M1** |
| Empty file-scope runs solo | Plan validation (dup keys, unknown deps, cycles, non-empty files required); `files:[]` ⇒ conflicts-with-everything | **M1** |
| No leaks | Global worktree/branch prune at startup | **M1** |
| Honest cost | New `cost_usd` column (additive migration; legacy runs logged, start at 0); cap compares USD from CLI `total_cost_usd` incl. planner/reviewer calls; atomic with transitions; `--cost-cap-usd` (old flag = deprecated alias) | **M4** |
| Log/journal rotation · resumable planning (`planning`/`plan_failed` statuses) · Linear reconcile sweep · `dgorch doctor` · state backups | as specced in Annex C | **M4** (reconcile sweep: **M2**) |

Every M1 row lands with a chaos test (10 new tests specced: dirty-repo parallel merge, kill-during-pause, dual-serve takeover, bot-comment poisoning, secret-file exclusion, timeout-edit discard, leak-free crash cycles, solo empty-files, and more).

### Pillar B — Phone channel (Telegram; updates + one-tap decisions)
**Decision: Telegram day one; SMS later as a drop-in adapter.** Researched July 2026: US SMS (Twilio A2P sole-prop) = **2–3 weeks carrier registration**, ~$3/mo + ~$0.012/msg; two-way is webhook-first (polling possible but poor). Telegram = free, live in ~5 min, long-polls from the laptop with **no public URL**, inline buttons give one-tap answers. The `Notifier` interface keeps the "ideally SMS" door open once the GCP VM (public URL) exists — nothing blocks Phase 2 on carrier paperwork.

- **Events (all immediate, no throttling in v1):** plan ready, task → Human Review, question asked, run complete, run stuck, cost-cap stop. No digests, no quiet hours, no per-hour caps — phone DND covers nights; the Notifier interface makes throttling a retrofit if a real run proves annoying.
- **Buttons for every decision; free text only for fix-notes.** Questions: option buttons (`A / B / Go with rec`, callback carries `q:<id>:<letter>`). Review cards: `Approve` / `Request changes` buttons (callback carries the task's **Linear identifier**, e.g. `DEE-12`, persisted on the task row at upsert). "Request changes" prompts for one free-text note. No bare-letter grammar, no short-id mapping, no disambiguation flows.
- **Questions machinery (one mechanism, three uses).** SQLite `questions` table; answers apply through a **guarded compare-and-set** transition (`expectedStatus`) — first channel (phone or Linear) wins, the loser is a logged no-op with a polite reply.
  1. **Plan gate = question #0.** After planning, run status → `awaiting_plan_approval`; serve loop owns the wait; phone gets task list + **task count and cost cap** (facts, not estimates) with `GO / Cancel` buttons; Linear equivalent: the plan issue moved to a completed-type state. `--no-plan-gate` skips. Default ON.
  2. **Mid-task questions — workers can actually ask.** Worker output contract: a final `QUESTION: <prompt> | A) … B) … | REC: <letter>` line ⇒ task transitions to `blocked` (zero attempts consumed, worktree removed), question row inserted, phone pinged. Answer ⇒ appended to the task description (`ANSWER: …`) ⇒ `ready`, rebuilt with the answer. Rides the existing blocked/recycle machinery — no new engine capability.
  3. **Review verdicts from the phone** via the same guarded transition as Linear verdicts.
- **Paired, not open:** `dgorch serve` prints a one-time pairing code; the bot binds only on `/start <code>` and ignores every other chat id. No unauthenticated stranger can GO a plan or approve a merge.
- **Process model:** one process; serve starts the Telegram long-poll as a concurrent promise sharing the synchronous SQLite store; inbound taps write to SQLite and poke the serve wait so answers apply immediately; `getUpdates` offset persisted ⇒ crash never double-applies a tap. `notify()` is fire-and-forget (5s timeout, backoff after 3 failures); nothing queues — Linear holds all state.
- **Setup (entire):** `TELEGRAM_BOT_TOKEN` + `/start <code>`. Channel inferred from token presence (no `NOTIFY_CHANNEL` var).

### Pillar C — The review crew (personas)
A persona = one markdown file (frontmatter: `name`, `stage`, optional `model`/`maxTurns`; body: mission, hunt list, ignore list, output contract). Resolution: repo-local `.dgorch/personas/` shadows global `personas/` by filename; content hash journaled per run. Adding a reviewer later = one file + one line in the panel list (no trigger DSL, no auto-discovery).

**Panel (replaces the single reviewer)** — correctness first, short-circuit on reject; triggered specialists in parallel:

| Reviewer | Trigger | ~% of tasks |
|---|---|---|
| Correctness | always | 100% |
| **Security** | deterministic diff heuristic: auth/api/db/config/env paths, dependency-manifest changes, risky patterns (`exec`, `eval`, `innerHTML`, `sql`, secrets) | ~40–60% |
| Test-quality | >100 source LOC added with no test changes, or acceptance mentions tests — earns its slot because it fires on **auto-done backend work no human sees** | ~30% |

Cut from v1 (each is one persona file away if wanted): design-fidelity (userVisible tasks already park at Human Review — Ziah *is* that reviewer, with screenshots), performance, worker personas/routing (no success metric yet; Phase 3 if the generalist demonstrably underperforms).

- **Aggregation:** any REJECT ⇒ rejected (reviewers reject only on critical/high; medium/low post to Linear as advice). Reasons concatenate `[security] …; [correctness] …`.
- **Rejections actually reach the retry:** on panel rejection the reasons are written as a lesson (`store.addLesson`, capped 20) AND rendered in the retry brief — specced explicitly because today's `fail()` path drops them.
- **One bound, not three:** review rejections consume the existing `attempts` counter; when attempts exhaust **via review-rejection** the terminal state is `blocked` (Ziah decides), not `dead`. No new counter.
- **Cost:** typical 1.7–2.4 reviewer calls/task; worst-case bounded by attempts. Security persona ships as the exemplar (hunt list: injection, IDOR, secrets, deps, SSRF/XSS, fail-open; fail-safe: unparseable = reject).

## 5. A Phase-2 run
1. `/dgorch <project>` → plan → **phone: "Plan: 8 tasks, cap $10 — GO / Cancel"** → tap GO.
2. Workers build in isolated worktrees; panel reviews; gates run; merges land in the integration worktree. Linear moves in real time (reconciled every cycle).
3. Phone: *"Q: Stripe or Paddle? A/B — rec A"* → tap A → task resumes with the answer.
4. Phone: *"Review 'Checkout flow' (DEE-12)"* → `Approve` tap, or approve in Linear — first wins.
5. Phone: *"Run complete: 8/8, $3.80"* — or *"STUCK: merge conflict, DEE-9"* the moment it happens.
6. Laptop killed mid-run? Rate-limited at 2am? Second engine launched by mistake? Paused, resumed, refused — respectively. Zero lost or duplicated tasks.

## 6. Non-goals
No web dashboard. No multi-user. No Slack/Discord/email. No SMS until the VM exists (adapter interface only). No worker-persona routing (Phase 3). No design-fidelity/performance reviewers in v1. No notification throttling until proven needed. No automatic main-branch merges.

## 7. Build plan
- **M1 — Bulletproof.** All Pillar-A M1 rows + chaos tests. *Exit: suite green; kill -9 anywhere leaves no orphan process/worktree/lost state; simulated 429 completes after auto-resume with 0 dead-letters.*
- **M2 — Telegram + questions + plan gate + reconcile sweep.** *Exit: full run driven from the phone (pair → GO → mid-task answer → review tap → complete ping); engine identical with the channel disabled; Linear board provably matches store state each cycle.*
- **M3 — Review panel.** *Exit: security persona rejects ≥9/10 seeded critical flaws; rejection reasons appear verbatim in retry briefs; triggers match the table; exhausted review-rejections park `blocked`, never `dead`.*
- **M4 — Cost-in-USD, doctor, rotation, backups, resumable planning.** *Exit: reported spend within 5% of CLI-summed truth; `dgorch doctor` green in <1 min on a fresh machine.*
Each milestone ships alone; the engine stays usable throughout.

## 8. Success metrics
- **Bulletproof:** 0 lost/duplicated tasks across the chaos suite; mid-run rate limit ⇒ plan completes after auto-resume, 0 dead-letters.
- **Pocket:** median time-to-decision (question or review) < 5 min; 0 runs stalled >12h on an unseen question; pairing prevents any non-Ziah interaction.
- **Crew:** ≥9/10 seeded critical vulns rejected; <20% of tasks need a 2nd review round.
- **Simple:** new-machine setup = Claude login + Linear key + bot token; no new config vars beyond `TELEGRAM_BOT_TOKEN`.

## 9. Decisions made (flag disagreement; otherwise building to these)
1. **Telegram first; SMS later** behind the same Notifier adapter (A2P = 2–3 weeks + webhook-first vs. now).
2. **Plan-approval gate ON by default** (`--no-plan-gate`), implemented as question #0 — no second approval mechanism.
3. **Security review by deterministic heuristic**, not every task; human gate still backstops all user-visible work.
4. **All notifications immediate; no throttling stack** in v1 — phone DND covers nights.
5. **One retry bound** (`attempts`); review-rejection exhaustion parks `blocked`, never `dead`. Max 3 human bounces.
6. **Cost cap in USD** (`cost_usd`, additive migration; deprecated token flag aliased).
7. **Panel = correctness + security + test-quality**; everything else is a persona file away, later.

## Appendix
Build-ready detail: `docs/phase2-design-annexes.md` — Annex A (phone channel), B (personas/panel), C (bulletproofing fix spec), **D (critique resolutions — 26 issues from two adversarial reviews and how each was resolved; mechanisms for the question producer, plan gate, verdict moved-guard, review-lesson wiring, cost migration, and process model)**. The PRD is scope and priority; the annexes are the letter of the spec.
