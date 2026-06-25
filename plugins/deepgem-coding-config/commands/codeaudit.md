---
description: Hierarchical evidence-anchored audit of the deployed commit — grades 8 major components → 3–5 minors each (A–F) → rolled-up majors → one overall grade, into a forwardable CODE-AUDIT.md
argument-hint: "[path] [env]"
allowed-tools: Read, Grep, Glob, Bash
---

Run a **hierarchical**, evidence-anchored audit of a codebase and write a forwardable `CODE-AUDIT.md`. **This command does NOT modify source code** — the only file it writes is the report.

This is the hierarchical companion to the `code-audit` skill. It inherits that skill's non-negotiables verbatim, and differs only by grading hierarchically (major → minor → roll-up → overall) instead of seven flat dimensions. **Where this command and the skill could disagree, the skill wins.**

**Arguments:** `$ARGUMENTS` — first token is an optional repo path (default: current working directory); second token is an optional target env (`prod` / `staging` / `dev`; default: prod). Example: `/deepgem-coding-config:codeaudit ~/work/shinesty prod`.

**Scope note — performance/scalability:** deep performance grading (N+1 patterns, hot-path complexity, payload sizes, caching, bundle/render budgets) is graded narrowly here under minor **7.6** rather than as a standalone major, to stay cohesive with the skill. For a dedicated performance pass, raise it via `/deepgem-coding-config:qa-review` or a profiling tool — this command grades the structural hazards, not a full profile.

**Trend note:** this command does **not** diff against prior audits — each run overwrites `CODE-AUDIT.md`. For grade-over-time trend tracking, use the `code-audit` skill, which diffs against its prior `AUDIT.md`.

## Non-negotiables (inherited from the skill)

- **Evidence or it didn't happen.** Every grade and finding cites a `file:line`, a commit SHA, or pasted runtime output (`curl` / log line / scanner / `gh api` / DB query). A grade or cap asserted without evidence is invalid.
- **Audit the DEPLOYED commit, not `main`.** Verify the per-env branch/image actually running before reading any code.
- **Verify against runtime truth where it matters** (cloud env config, logs, branch protection, applied DB schema, API responses). If you cannot, mark the item `(source-only; reason)` — never silently soften it.
- **Do NOT modify code.** Writing `CODE-AUDIT.md` is the only file mutation. No edits, no formatters, no "quick fixes."
- **Bash is for read-only inspection and report-writing ONLY.** Never run a command that edits, deletes, checks out over, resets, or formats source; never `git checkout`/`git reset`/`git clean`/`rm` the worktree; never run a code formatter or auto-fixer. (A read-only `git worktree add --detach <SHA>` to a *separate* directory is fine; do not mutate the user's working tree.) Read-only is enforced by policy, not by the tool grant — honor it strictly.
- **Forwardable.** The report must read cleanly to a non-engineer stakeholder without edits.

---

## Step 1 — Establish runtime truth (BEFORE reading code)

Resolve the repo path and env from `$ARGUMENTS` (ask only if genuinely ambiguous). Then, before grading anything:

1. **Determine the deploy model.** Inspect `.github/workflows/`, `Dockerfile`, deploy configs (`cloudbuild.yaml`, `*.tf`, `fly.toml`, `render.yaml`, etc.) to learn what triggers a deploy for the target env. Per-branch deploys mean `main` is **not** necessarily what's running.
2. **Identify the actually-deployed commit** for the target env: running container image tag, the deploy workflow's last successful run (`gh run list`), the cloud provider's revision history, or `git ls-remote`. State the method you used.
3. **Pin to that commit.** Resolve all `file:line` citations against the deployed SHA (read-only `git worktree add --detach <SHA>` to a scratch dir if convenient — never check out over the user's working tree).
4. **Record drift:** `main` HEAD vs deployed HEAD — commits on `main` not deployed, and commits deployed not on `main`.
5. **Inventory runtime access** you actually have (cloud config, logs/error tracker, GitHub API, DB, email/payment gateway). Anything you lack becomes a stated audit limitation and forces `(source-only)` on the affected minors.

If you cannot determine the deployed commit, say so explicitly, audit `main` as a fallback, and tag the whole report as deploy-state-unverified.

---

## Step 2 — Grade hierarchically (8 majors → 3–5 minors each)

Grade **every applicable minor** in the rubric below A–F using its anchored A/C/F descriptor. Each minor letter carries **exactly one line** of justification with an inline evidence anchor (`file:line`, SHA, or pasted runtime output). Two auditors applying these descriptors + the roll-up arithmetic + the caps should land within one notch.

**The C-baseline rule (and what it is NOT).** Grade a minor `C` only when you **have evidence** and that evidence shows ordinary, hazard-free competence — "works but unremarkable, accepted debt, no active hazard." `C` is the landing spot when the evidence is genuinely neutral. It is **NOT** the default for "I couldn't look." If you could not gather evidence for a minor at all, do **NOT** record `C` — mark it `(source-only; reason)`, state why, and apply the source-only ceiling (Step 3) plus any conservative hazard assumption. "No evidence" and "neutral evidence" are different epistemic states; never conflate them.

**One defect, one home (no double-counting).** A single defect is graded in **exactly ONE minor** — its primary home. Cross-references are **noted** in the other minor's justification but do **NOT** lower that minor's letter, and do not fire that minor's cap. Designated homes for overlapping defects:
- **Authorization / ownership / IDOR** → graded in **Security 4.1**. Correctness 5.3 grades only *non-authz* business-rule correctness; an authz defect is noted in 5.3 but scored only in 4.1.
- **CVE severity** → **Security 4.4** (dependency *hygiene*, non-security, stays in 1.4).
- **Secrets handling** → verify once; graded in **Security 4.3**, cross-referenced in Reliability 7.3 (take the lower ceiling, don't cap both).
- **Side-effect dedupe / idempotency** → grade the defect in whichever trigger matches: **5.4** for user/request-path double-submit (double-click, retry, refresh), **7.4** for background/scheduled/multi-instance triggering (cron, webhook redelivery, replica fan-out). The dedupe ledger is verified once; score the defect in the matching minor and take the lower ceiling — do **not** cap both majors for the same missing ledger.
- **CI gating** → verify once; graded in **8.4**, cross-referenced in Reliability 7.3.

**Inapplicable minors (N/A) — for non-standard codebases.** The rubric is web-service-shaped. For a pure frontend SPA, a mobile app, a CLI, or a library, some minors genuinely do not apply (e.g. DB schema 3.1, scheduler 7.4, deploy/rollback parts of 7.3). If a minor **genuinely does not apply** to this component type, mark it **N/A**, **exclude it from the major's weighted mean, and renormalize over the remaining minors**. If an **entire major** is N/A, exclude it from the eight-major Overall mean and renormalize. State each N/A and why in the report. Do **not** park an inapplicable minor at `C` — that pollutes the roll-up with a phantom dimension.

### Letter scale, the NOTCH unit, and points

**Letter scale (points for roll-up):** A = 4.0, A- = 3.7, B+ = 3.3, B = 3.0, B- = 2.7, C+ = 2.3, **C = 2.0 (baseline, evidence-backed)**, C- = 1.7, D = 1.0, F = 0.0.

**Definitions used by every cap and clamp below — read once, apply everywhere:**
- A **NOTCH** = one position on the 10-step ladder `A · A- · B+ · B · B- · C+ · C · C- · D · F`. "One notch above D" = `C-`. "One notch above F" = `D`.
- A **FULL LETTER** = three notches on that ladder (e.g. `B → C` spans `B · B- · C+ · C`). All clamp/cap arithmetic below is expressed in **notches**, never letters, so it stays computable to a single grade; "full letter" is only shorthand for "three notches."
- All cap/clamp arithmetic is expressed in **notches** so it is computable to a single grade.

### Banding table (weighted mean → letter)

Map a weighted mean to a letter by this table. Intervals are **half-open `[low, high)`**; a value exactly on a boundary takes the **lower** letter (ties round down).

| Letter | Mean range |
|---|---|
| A | ≥ 3.85 |
| A- | 3.50 – 3.85 |
| B+ | 3.15 – 3.50 |
| B | 2.85 – 3.15 |
| B- | 2.50 – 2.85 |
| C+ | 2.15 – 2.50 |
| C | 1.85 – 2.15 |
| C- | 1.35 – 1.85 |
| D | 0.50 – 1.35 |
| F | < 0.50 |

This makes "nearest band, ties round down" a deterministic lookup.

### MAJOR 1 — Architecture & Modularity
*How the system is decomposed and whether it can absorb change cheaply. (Skill: structural half of Structure/readability.)*

| # | Minor | A | C (baseline) | F | Evidence to cite |
|---|---|---|---|---|---|
| 1.1 | **Module decomposition & boundaries** *(×1.5)* | Cohesive single-responsibility modules behind public surfaces; dep graph a layered DAG | Recognizable structure, some `utils/` grab-bags & oversized files; boundaries by convention | Flat `utils/`/`misc/`, 1000+ line god-files mixing HTTP/logic/DB; imports reach into privates | `tree -L 2`/`git ls-files` at deployed SHA; largest files (`cloc`/`wc -l`); a cross-boundary import `file:line` |
| 1.2 | **Coupling & cohesion (no cycles)** *(×1.5)* | One-directional deps; `madge --circular`/`import-linter` zero cycles; shared state explicit | A couple peripheral cycles; some module globals; occasional shotgun surgery | Pervasive cycles; mutable globals/service-locators; one change touches 8 files; god-object | `madge`/`pylint`/`staticcheck` output **pasted with cycle count**; a global `file:line`; churn fan-out via `git log --name-only` |
| 1.3 | **Layering & dependency direction** | Clear layers, deps point inward; domain imports no framework/ORM; boundary linter **wired into CI and gating** | Layers by convention; no enforcement; occasional controller-with-rules | Domain imports the web framework or raw SQL; ORM model == DTO == domain; no tooling | Layer-inversion `file:line`; boundary-linter config presence; the CI step + whether it **gates vs merely present** |
| 1.4 | **Dependency & supply-chain hygiene** *(non-security)* | Lockfile committed & in sync; justified deps; no dup majors; reproducible; unused-dep scan clean | Lockfile present, a few unused/dup deps, loose ranges | No lockfile or drifted; dozens unused; multiple majors of a lib; wildcard/`latest` ranges | Lockfile + `npm ls`/`pip check`/`go mod verify`; `depcheck`/`knip`; wildcard ranges `file:line`. *CVE severity → Security 4.4, don't double-count* |

### MAJOR 2 — Code Maintainability & Readability
*Line-level cost of every future change. (Skill: readability half of Structure/readability.)*

| # | Minor | A | C (baseline) | F | Evidence to cite |
|---|---|---|---|---|---|
| 2.1 | **Readability & naming** *(×1.5)* | Names say what they do; small functions (<~50 lines), shallow nesting; named constants | Mostly readable; a few long functions, `tmp`/`mgr` names, inline magic numbers | God functions 200+ lines; `data2`/`doStuff`; 4+ nesting; stale copy-paste comments | 3–5 best/worst `file:line` spans (not one cherry-pick); a complexity/length scan, anchored to deployed SHA |
| 2.2 | **Dead code & duplication** | No commented-out blocks; dead-code scan clean; shared logic factored once | A handful of unused exports, one or two dup helpers | Large "just in case" blocks; same logic in 3+ drifting copies; dozens of unused exports | `knip`/`ts-prune`/`vulture`/`jscpd` output **pasted with count** (or `rg` for commented blocks); 2–3 dup `file:line` pairs |
| 2.3 | **Type safety** *(×1.5)* | Strict mode on; near-zero `any`/`ignore`, each justified; boundaries typed; type-check clean on deployed SHA | Typing on but not strict; scattered unjustified escapes | Strict off/absent; pervasive `any`/untyped boundaries; type-checker errors or never run | Config flag `file:line`; `rg -c 'any\|@ts-expect-error\|# type: ignore'`; actual `tsc --noEmit`/`mypy` on deployed SHA. *Dynamically-typed stacks: grade boundary input-validation instead and say so* |
| 2.4 | **Lint / format enforcement** | Linter+formatter, non-trivial ruleset, **exit 0** on deployed SHA | Config present but hundreds of ignored warnings, or rules too permissive | No config; or formatting visibly inconsistent proving `--check` isn't run | Config presence/content; actual exit code + warning count in `--check` on deployed SHA. *CI-gating half → 8.4, grade only local cleanliness here* |

### MAJOR 3 — Data Model & API Design
*The two hardest-to-reverse contracts: DB schema and external API, graded against runtime truth. (Skill: contract slice of Correctness + Structure.) Mark a minor N/A if the component has no DB or no external API.*

| # | Minor | A | C (baseline) | F | Evidence to cite |
|---|---|---|---|---|---|
| 3.1 | **Schema design & integrity** *(×1.5)* | Normalized; PK/FK/unique/check enforced at DB; correct types (no money-float, tz-aware); indexes match queries | Mostly sound; a few missing constraints / over-broad nullable columns | Missing FKs; money as float; all-nullable text; EAV/JSON-blob dodging schema; missing hot indexes | DDL `file:line`. **Verify runtime:** `\d+`/`SHOW CREATE TABLE`/`information_schema` on deployed DB (flag drift); `EXPLAIN` a hot query. Else `(source-only; applied schema unverified)` |
| 3.2 | **Migration safety & evolution** | Versioned, ordered, reversible/expand-contract; back-compat with running code; prod state == repo HEAD | Forward-only with occasional risky step; no down-migrations | Migrations edited after apply; out-of-order; destructive change same release as referencing code; prod diverges | Migration dir + ordering; destructive `file:line`; **applied-versions on deployed DB** (`alembic current`/`schema_migrations`/`prisma migrate status`). Else `(source-only)` |
| 3.3 | **API contract & versioning** *(×1.5)* | Checked-in contract that **matches runtime**; versioning + deprecation; consistent verbs/status/pagination/errors; edge validation; breaking-diff CI gate | Implicit contract, mostly consistent; no versioning but additive | No contract or one drifted from server; ad-hoc shapes (200-on-error); no versioning; unvalidated input into handlers | Contract `file:line`. **Verify runtime:** `curl` deployed endpoint, paste drift/inconsistent error shape; route `file:line`; schema-diff CI (`oasdiff`/`buf breaking`). Else `(source-only)` |
| 3.4 | **Domain modeling & type integrity** | Concepts as explicit types (`Money`,`UserId`), invariants at construction; one canonical model; deliberate mapping | Some value objects, some primitive-passing; a concept modeled twice | Primitive obsession everywhere; one concept modeled 3 incompatible ways; validation scattered & inconsistent | Primitive-obsession `file:line` vs value-object alternative; `rg -c` of `any`/`interface{}`; two divergent definitions cited side by side |

### MAJOR 4 — Security & Attack Surface
*The hardest cap. Verified against the deployed env, not `main`. Authorization/IDOR is graded HERE (cross-referenced from 5.3). (Skill: Security.)*

| # | Minor | A | C (baseline) | F | Evidence to cite |
|---|---|---|---|---|---|
| 4.1 | **AuthN / AuthZ** | Every state-changing/PII route authenticates at a server-side choke point; ownership/tenant scope on read AND write; deny-by-default; signed expiring tokens (alg pinned); no prod debug bypass | Auth present but per-handler so new routes risk defaulting open; minor IDOR surface | Unauthenticated state-changing/PII endpoint reachable in a deployed env; pervasive IDOR; `alg:none`/hardcoded secret; `DISABLE_AUTH` reachable in prod **(HARD CAP)** | Pasted `curl` vs deployed URL showing response code for an unauth state-changing request; middleware/route-registration `file:line`; ownership-check `file:line` or absence; `rg 'DISABLE_AUTH\|SKIP_AUTH'` + prod env config. `(source-only; reason)` if curl impossible |
| 4.2 | **Input validation & injection** (SQLi/cmd/XSS/SSRF/deser) | All input schema-validated at boundary; parameterized queries only; no shell-out with interpolation; auto-escaping on; URL fetches allow-listed + block internal/metadata IPs; no `eval`/`pickle.loads` on untrusted | Mostly parameterized + validated; one or two unvalidated internal endpoints | Any reachable injection sink on user input: string-built SQL, `exec(`/`child_process` interpolation, `dangerouslySetInnerHTML`/`\|safe` on user data, SSRF-able fetch, native deser **(HARD CAP)** | Exact sink `file:line` (the concatenated query, the `exec(`, the `dangerouslySetInnerHTML`, the `fetch(req.query.url)`); data-flow note proving input is user-controlled & unsanitized; reachability proof where obtainable |
| 4.3 | **Secrets handling & fail-closed** | No secrets in source or git history (scanned); prod secrets from a manager; missing critical secret crashes at boot (fail-closed); per-env least-privilege; `.env` gitignored | Secrets in env vars (not a manager) but not in source; per-env separation imperfect | Live secret committed granting access to a deployed system; OR critical secret with insecure default failing OPEN; OR one shared key across envs **(HARD CAP)** | `gitleaks`/`trufflehog` over tree **and history**, or `rg` for `sk_live`/`AKIA`/`-----BEGIN` `file:line`; fallback expression `file:line` + boot path; cloud env showing manager-ref vs inline plaintext. `(source-only)` if cloud config unreadable. *Verify once; cross-ref 7.3, take lower ceiling* |
| 4.4 | **Supply-chain & dependency security** | Lockfile pinned; `npm audit`/`pip-audit`/`osv-scanner` no unpatched HIGH/CRITICAL on reachable deps; Dependabot/Renovate enabled & acted on; no `latest`/git-HEAD | Scanning present, a few low/triaged advisories; some advisory-only gates | Exploitable CRITICAL CVE in a runtime-reachable dep on the request path; OR scanning absent + stale tree **(HARD CAP for exploitable-CRITICAL)** | `npm audit --omit=dev`/`pip-audit`/`osv-scanner` **pasted** with advisory IDs + severity; dep name+version from lockfile + import `file:line` on a reachable path; `dependabot.yml`/`renovate.json` + whether the gate blocks. Distinguish dev-only vs runtime-reachable |
| 4.5 | **PII exposure & attack-surface hygiene** | PII never returned to unauthorized callers, never logged plaintext, not in errors; minimal surface (no unauth `/test`/`/debug`/`/admin`/`/metrics`); CSP/HSTS; CORS scoped; rate limiting on auth/abuse; `DEBUG=false` in prod | One verbose error path or an authed-but-broad debug route; partial rate limiting | PII/secret in a response or plaintext log, or unauth PII endpoint in prod; stack traces to clients; debug/admin/metrics unauth; `ACAO:*` with credentials; no rate limit on login/OTP/reset **(HARD CAP for unauth PII)** | Pasted `curl` showing PII/stack trace; serializer/logger `file:line` emitting PII; `rg` + deployed-URL probe for debug routes with auth status; CORS/headers config `file:line` + response-header dump. `(source-only)` where live probe couldn't run |

**Weakest-link floor:** because an attacker exploits the weakest axis, the Security major is capped at **one notch above its lowest minor**, applied after the weighted mean — then apply the hard caps (take the lowest result). Worked: lowest minor `D` (1.0) → Security capped at `C-`; lowest minor `F` (0.0) → Security capped at `D`. (This is the strict form of the global Step-3 override; the per-finding hard caps below may set it lower still.)

### MAJOR 5 — Core Flow Correctness & Spec Conformance
*Do the primary journeys do the right thing on the deployed commit, and match the spec/SOW? Authorization defects are graded in Security 4.1, not here. (Skill: Correctness + Product engineering.)*

| # | Minor | A | C (baseline) | F | Evidence to cite |
|---|---|---|---|---|---|
| 5.1 | **Happy-path correctness of critical flows** *(×2)* | Every critical journey (auth, core CRUD, checkout, submission) traced entry→persisted result and correct, verified by runtime exercise or full file:line call-chain; no flow gated by flag-off code | Flows work but one has a fragile or untraced hop | A critical flow broken/silently no-ops/persists wrong result on deployed commit (missing `await` races the write, success handler unreached, real logic behind prod-off flag) **(HARD CAP)** | Per flow: entry `file:line`, chain of hops to persisted/returned result, pasted runtime evidence (curl/log/DB row/screenshot) on deployed SHA. `(source-only)` if not exercisable + why |
| 5.2 | **Feature-spec / SOW conformance** *(×1.5)* | Each promised deliverable maps to implementing code; no material divergence; scope cuts documented | Mostly conformant; a minor undocumented deviation | A contracted deliverable missing or a stub (mock/hardcoded) with no documented deviation **(CAP)** | Spec-line → code `file:line` → status (Implemented/Partial/Stub/Missing) per deliverable; cite spec source (SOW section, ticket ID). Note where no spec available as a limitation |
| 5.3 | **Business-rule & data-integrity correctness** *(×2)* | Domain rules (pricing/tax/totals, state transitions, quota, date/tz/currency) correct & enforced server-side; invariants uncraftable-around; safe monetary types | A rule over-trusts client input but not exploitable for harm | A non-authz rule wrong or only client-enforced (price trusted from request, state skips required prior state, money in floats) **(HARD CAP)** | Rule implementation `file:line` + the defect; runtime reproduction (request + response/DB state) showing the invariant violated on deployed SHA where obtainable. *Authorization/ownership defects are graded in 4.1 — note them here but do not score them here* |
| 5.4 | **Concurrency / idempotency of REQUEST-PATH side effects** *(×1.5)* | User/request-triggered double-submits (double-click, retry, refresh) idempotent/guarded by dedupe key, unique constraint, or optimistic lock | One request-path side-effect relies on UI disabling rather than a server guard | A retried/double-submitted *request-path* action produces a duplicate side effect or corrupted record — no guard **(CAP)** | Side-effecting write `file:line` + presence/absence of guard (unique index, dedupe table, lock); runtime evidence (duplicate rows/gateway events) where obtainable, else `(source-only)`. *Background/scheduled/multi-instance dedupe is graded in 7.4; verify the ledger once and score the defect in whichever trigger matches — do not cap both majors* |

### MAJOR 6 — Failure Handling & Failure-State UX
*What the user experiences when something goes wrong. (Skill: failure-path slice of Product engineering.) Mark UI-only minors N/A for a headless service/CLI/library.*

| # | Minor | A | C (baseline) | F | Evidence to cite |
|---|---|---|---|---|---|
| 6.1 | **Error catching & honest surfacing** *(×2)* | Errors on user paths caught → clear actionable message (no stack/secret leak); never swallowed into false success; correct status codes; real error state rendered | Generic "Something went wrong" with no path forward, but failures not hidden | Errors swallowed (empty `catch`, `.catch(()=>{})`) → forever-spinner or **false success on a failed write**; OR raw stack traces shown to users **(CAP — false-success on a write is a correctness defect)** | Catch/handler `file:line` or absence + user-facing rendering; runtime evidence — trigger the failure, paste response/screenshot on deployed SHA, else `(source-only)` |
| 6.2 | **Edge-case & boundary-input handling** *(×1.5)* | Edge inputs handled (empty/null/whitespace, zero/negative, oversized, unicode, expired session, pagination bounds); validation server-side | Client-side validation solid, server-side thin but not exploitable | Boundary inputs crash/corrupt/silently accepted into invalid state (negative quantity, null → 500); validation client-only & bypassable | Validation `file:line` or gap; runtime probe (submit empty/negative/oversized, paste response/status) on deployed SHA where possible, else `(source-only)` |
| 6.3 | **Loading / empty / failure-state UX** *(×1.5)* | Every async surface has deliberate loading, non-blank empty (with guidance), and error (with retry) states; destructive actions confirm; in-flight buttons disable | States mostly present, one or two blank-on-empty screens | Permanent spinner on failure, blank empty screen, dead-end UI with no error affordance; destructive fires with no confirm; buttons double-fire | Component `file:line` showing presence/absence of loading/empty/error branches; screenshots on deployed app where reachable; cross-ref `qa-review`/`polish-sweep` if available, else `(source-only)` |
| 6.4 | **Accessibility of failure & interactive states** | Errors programmatically announced (`aria-live`/`role=alert`, `aria-describedby`/`aria-invalid`); focus managed on state change; controls keyboard-reachable + labeled; not color-alone; contrast met | Visible error text, partial ARIA wiring | Errors visual-only so AT never announces failure; focus lost/trapped; mouse-only/unlabeled controls; color-only indication | Error/status markup `file:line` showing presence/absence of `aria-live`/`role=alert`/`aria-describedby` + focus management; `axe`/inspector result or screenshot where a browser is available, else `(source-only)` |

### MAJOR 7 — Reliability, Operability & Observability
*Can a prod-affecting failure be detected before a user sees it, survived, and recovered from — including the runaway-job class and whether hot paths stay fast under load. (Skill: Observability/operability + resilience half of Correctness.) Mark deploy/scheduler minors N/A for a library.*

| # | Minor | A | C (baseline) | F | Evidence to cite |
|---|---|---|---|---|---|
| 7.1 | **Logging, metrics & error tracking** | Structured (JSON) logs with propagated correlation ID, correct levels, no PII; four golden signals on a dashboard tied to the deployed service; error tracker captures exceptions with release/commit tagging + dedupe | Logs structured-ish, some metrics, exceptions land in logs without aggregation | Bare `print`/`console.log` no structure/ID/level; no app metrics (only provider CPU); exceptions vanish, no release tagging | Logger/metrics/error-SDK init `file:line`; a pasted real log line (shows/misses correlation ID); log-backend query or error-tracker count for last 7d; `rg -c 'console.log\|print('` in request paths. `(source-only; no backend access)` |
| 7.2 | **Alerting before user impact** *(×2)* | Paging alerts on error-rate/latency-SLO/saturation to a watched destination; ≥1 symptom-based; thresholds documented & fired within 90d (not muted) | Alerts exist but mostly cause-based or noisy | No alerts, OR they route to an unmonitored inbox, OR all permanently snoozed — outages learned from support tickets **(HARD CAP — the skill's explicit A-bar)** | Alert config (Terraform/Datadog monitor/CloudWatch alarm) `file:line` or pasted from runtime; alert-history showing last fire; the destination integration. `(source-only; alert delivery not verified)` if unverifiable |
| 7.3 | **Deploy integrity, rollback & runtime config** *(×2)* | Deploys automated from a protected branch; deployed image/commit traceable to a merged reviewed PR (SHA-tagged); rollback is one documented exercised command; secrets managed, fail-closed, per-env | Deploy semi-automated, rollback known but untested; drift short-lived | Prod deployed by hand from a laptop/console; running commit unmappable to a merged PR; **no rollback path** **(HARD CAP)** | Deploy workflow `file:line`; running image tag vs git SHA (from Step 1); `gh run list` for the deploy job; drift line; rollback runbook `file:line` or absence. *Secrets graded in Security 4.3; CI-gating graded in 8.4 — verify once, cross-ref, take the lower ceiling* |
| 7.4 | **Scheduler/cron & BACKGROUND side-effect lifecycle safety** *(×1.5)* | Scheduled/background jobs externally triggered (Cloud Scheduler/EventBridge/CronJob), not in-process timers that multiply per instance; side effects idempotent + deduped via an event ledger; multi-instance concurrency bounded by lock/queue | Single-instance today so in-process timer benign, but no structural guard | In-process `setInterval` runs N× on N instances (runaway-job risk); no dedupe ledger so retries/redeliveries double-charge/double-send; horizontal scaling multiplies side effects **(HARD CAP — the skill's named runaway-job class)** | Scheduler definition `file:line` (in-process vs external); presence/absence of an `email_event`/`payment_event`/`webhook_event` dedupe model `file:line`; deployed instance/replica count; send/charge volume from the gateway for last 7d, else `(source-only)`. *Request-path double-submit is graded in 5.4; verify the ledger once and score the defect in whichever trigger matches — do not cap both majors* |
| 7.5 | **Resilience & data durability** | Every outbound call has a timeout; bounded retries w/ backoff+jitter on idempotent ops only; graceful degradation; pool limits sized vs DB `max_connections`; automated backups with a **test-restored** RPO | Timeouts on most calls; backups configured but never restore-tested | Outbound calls with no timeout (one slow dep exhausts the pool → outage); unbounded retries on writes; no resource limits → OOM; **no backups, or never test-restored** **(CAPS)** | HTTP/DB client timeout `file:line` (or absence); retry/backoff `file:line`; pool vs DB `max_connections`; deploy-manifest limits `file:line`; backup config from the DB console + any restore-test record, else `(source-only)` |
| 7.6 | **Performance & scalability of hot paths** *(×1.5)* | No N+1 on hot paths (batched/joined); response payloads bounded + paginated; caching where it pays; SPAs within a stated bundle/render budget; hot queries index-backed (`EXPLAIN` clean) | One N+1 or unbounded list on a non-critical path; payloads a bit large; no measured budget but no obvious cliff | N+1 in a critical loop (per-row query in a list endpoint); unbounded result sets; full-table scans on hot queries; SPA bundle so large initial render stalls; no caching where load demands it | Loop+query `file:line` proving N+1; `EXPLAIN`/query-plan output (pasted); p95 latency from logs/APM; response size from `curl -w '%{size_download}'`; bundle-analyzer output for SPAs. `(source-only)` if no runtime/profile access |

### MAJOR 8 — Testing, CI & Developer Experience
*Whether quality is protected over time and a new dev can become productive. (Skill: Testing/CI + the release-integrity gating it names.)*

| # | Minor | A | C (baseline) | F | Evidence to cite |
|---|---|---|---|---|---|
| 8.1 | **Test quality** *(×1.5)* | Tests assert real behavior incl. error paths, concurrency, boundaries; minimal over-mocking; deterministic; scenario-named | Happy-path tests present; critical error paths thin; a few skips | Tests assert trivial truths (`expect(true)`, snapshot-everything, "mock was called"); critical logic untested; flaky/skipped accumulating | 2–3 strong + weak tests `file:line`; skip count `rg -c '\.skip\|xit\|@pytest.mark.skip'`; cross-ref whether Major 5/7 gaps (runaway-job/idempotency) have any covering test |
| 8.2 | **Effective coverage (not just reported)** | Coverage measured AND critical modules (payments/auth/core domain) well covered; a floor enforced in CI | Global coverage measured, critical modules moderate | No coverage measured; OR a headline % that collapses on critical modules; OR gamed by trivial files **(CAP if a critical module is ~0%)** | Coverage on deployed SHA broken down **by critical module** (`jest --coverage`/`pytest --cov`/`go test -cover`), not a global number; the CI line that does/doesn't enforce a floor. `(source-only)` if uncomputable |
| 8.3 | **Onboarding & developer docs** | README/CONTRIBUTING a stranger can follow to a running app in one sitting; one-command setup; `.env.example` with every required var; decision notes | README adequate, `.env.example` slightly stale | Default-scaffold README; stale setup referencing dead scripts/vars; no `.env.example` so vars are tribal knowledge **(CAP at B+ for this major)** | README/CONTRIBUTING `file:line`; `.env.example` vs vars the code reads (`rg` `process.env`/`os.environ` and diff); whether documented setup commands resolve to real scripts |
| 8.4 | **CI enforcement on the deployed branch** *(×2)* | CI runs lint+types+tests+coverage on every PR AND those checks are **required in branch protection on the actually-deployed branch**; failing checks block merge; stale reviews dismissed; no force-push | Checks run but only some required; protection on `main` while a different branch deploys | Jobs `continue-on-error`/allow-failure, OR protection doesn't require them so red merges, OR no CI at all **(HARD CAP)** | `gh api repos/:owner/:repo/branches/<deployed-branch>/protection` **pasted** showing `required_status_checks`, `required_pull_request_reviews`, `allow_force_pushes`; workflow YAML `file:line` + any `continue-on-error`. **Verify against the DEPLOYED branch from Step 1, not `main`.** *Also the gate behind Major 7's deploy integrity — verify once, cite in both* |

---

## Step 3 — Roll up to major grades, then an overall grade

All arithmetic below uses the **notch** unit and the **banding table** defined in Step 2. State the per-minor points, the weights, the computed mean, and any clamp/cap applied so the math is reproducible.

**Minor → Major.**
1. Convert each minor letter to its points. **Exclude any N/A minor** and renormalize the weights over the remaining minors.
2. Take the **weighted mean** of the major's minors using the per-minor weights marked `(×N)` (default 1×).
3. Map the mean to a letter via the banding table.
4. **Apply the open-hazard override (below).** Then apply any per-finding hard cap for that major. **The major grade is the LOWEST of all of these.**

- **Open-hazard override (one rule, all majors):** any minor at **D or F whose justification cites OPEN, runtime-verified production impact** forces its major to **at most one notch above that lowest minor** — the weakest-link rule, applied to every major (Security's floor is the same rule, always on for Security). You cannot average away an active risk. This is then subject to the per-finding hard caps; take the lowest. (Bounded and computable — no "at least one full letter" open-ended pull.)

**Major → Overall.** The overall grade is the **LOWEST of**:
- **(a)** the **banding-table letter of the mean of the applicable major grades** (exclude any wholly-N/A major and renormalize),
- **(b)** the **lowest-major-plus-one-notch clamp** — overall cannot exceed the lowest single major by more than one notch (a single failing major drags the headline),
- **(c)** **every triggered OVERALL hard cap** below.

Take the **minimum** across (a), (b), and (c). *Worked example:* a broken critical flow forces Major 5 = `D` and its OVERALL cap = `C`; lowest major is `D`, so (b) = one notch above `D` = `C-`; (a) is the major-mean band. Overall = min(band, `C-`, `C`) = `C-`.

**Source-only ceiling (one rule, both cases).** Any minor whose evidence is `(source-only)` — for **ANY** reason, whether runtime access was missing entirely or simply not exercised — cannot exceed **B+**. Note the reason inline. This is a single ceiling; there is no exempt "no access at all" case. (See the C-baseline rule in Step 2: a minor you couldn't inspect is `(source-only)`, never `C`.)

### HARD CAPS (clamp regardless of the mean; evidence-gated)

**Rule for combining caps: when multiple caps fire on the same axis OR multiple OVERALL caps fire, take the LOWEST triggered ceiling.** Name each invoked cap inline next to the affected grade with its evidence. These caps feed sources (a)/(c) of the Major→Overall minimum above.

**Security** (the one major whose failure floors the whole codebase):
- Unauthenticated state-changing OR PII-returning endpoint reachable in any internet-facing deployed env → 4.1/4.5 = **F**, Security = **D**, **OVERALL = D**.
- Confirmed exploitable injection/XSS/SSRF on a deployed path → 4.2 = **F**, Security = **D**, **OVERALL = C-**.
- Live secret in source/history granting access to a deployed system, OR a critical secret that fails OPEN → 4.3 = **F**, Security = **D**, **OVERALL = C-**.
- Exploitable CRITICAL CVE in a runtime-reachable dep on the request path → 4.4 = **F**, Security = **C-**, **OVERALL = C-**.
  *(All four are consistent with the weakest-link floor: an `F` minor (0.0) caps Security at one notch above `F` = `D`; the CVE cap sets `C-` explicitly, which is lower than the floor would force only when other minors are weak — take the lowest.)*
- **Security A-floor:** Security cannot be A/A- unless ALL hold — no unauth state-changing/PII endpoint in any reachable env; secrets fail-closed & absent from source; least-privilege per-env creds; no obvious injection/XSS/SSRF; no unpatched runtime-reachable HIGH/CRITICAL. If any of these is `(source-only)`, the global source-only ceiling already caps it at **B+** — state why.

**Architecture & data:**
- Unbroken import cycle through core/domain modules → 1.2 = **C**, Architecture = **B-**.
- Layer inversion (domain imports the web framework or raw SQL) → 1.3 = **C+**.
- Boundary/layer linter present but NOT enforced in CI → that minor = **B** (present-but-not-gating).
- Confirmed prod schema drift (applied ≠ latest migration, runtime-verified) → 3.1 & 3.2 = **C**, Data Model & API = **C+**.
- Money stored as float, OR a missing FK on a relationship the app assumes enforced → 3.1 = **C**.
- Published API contract drifted from verified runtime behavior (curl proves mismatch) → 3.3 = **C-**.
- No lockfile, or open high/critical CVE with no triage → 1.4 = **C** (CVE severity graded in Security 4.4).

**Correctness & product** (when multiple OVERALL caps below fire, take the lowest):
- A critical user flow broken / silently failing on the deployed commit → Major 5 = **D**, **OVERALL = C**.
- Non-authz business-rule/data-integrity defect letting a user reach a financially-wrong or invalid state → Major 5 = **C**, **OVERALL = B-**. *(Authorization/ownership defects are graded in Security 4.1 and use the Security caps above — not this row.)*
- Errors silently swallowed into a FALSE SUCCESS on a user-facing write → Major 6 = **C** (correctness defect, not polish).
- A contracted (SOW/spec) deliverable missing or a stub with no documented deviation → 5.2 = **D**, Major 5 = **B-**.

**Maintainability & testing:**
- Type-check or lint does NOT run clean on the deployed commit (errors, not warnings) → Major 2 = **B**.
- CI checks not required on the actually-deployed branch (present-but-not-enforced) → 8.4 = **F**, Major 8 = **C**, **OVERALL = B**.
- A critical module (auth/payments/core domain) has effectively zero test coverage → Major 8 = **C**.
- No onboarding doc / no `.env.example` — setup is tribal knowledge → Major 8 = **B+**.

**Reliability & release:**
- No alerting that fires before user impact (absent/unrouted/all-muted) → 7.2 = **F**, Major 7 = **B-**, **OVERALL = B-** (the skill's A-bar).
- Deployed code ≠ reviewed code on a protected branch, OR a manual irreversible prod deploy step, OR no rollback path → Major 7 = **C+**, **OVERALL = C+**.
- Runaway-job / non-deduped background side-effect risk on a multi-instance deploy (double-send/double-charge possible) → 7.4 = **F**, Major 7 = **C+**, **OVERALL = C+**.
- Plaintext prod secrets in source/CI, OR a critical secret that fails open → graded in Security 4.3 (caps above); cross-referenced in 7.3 — take the lower ceiling on merge, do not double-cap.
- Outbound dependency call with no timeout on a hot path → 7.5 = **D**, Major 7 = **C**.
- No backups, or backups never test-restored, for the primary datastore → 7.5 = **D**.

**Universal A-gate.** Overall cannot be A unless: no P0/P1 open; the runaway-job class is structurally impossible (idempotent + externally scheduled + deduped); every prod-affecting failure is alertable before a user sees it; deployed code == reviewed code on a protected branch; secrets fail-closed; no unauthenticated state-changing/PII endpoints in any internet-reachable env; CI gates are enforced, not just present. Any single failure caps the overall below A.

---

## Step 4 — Write `CODE-AUDIT.md`

Save to **`CODE-AUDIT.md` at the repo root** (do NOT clobber the skill's `AUDIT.md`; if a prior `CODE-AUDIT.md` exists, overwrite it — this command does not diff against prior audits).

**This command has no `Write` tool.** Write the report via Bash using a **quoted** heredoc so backticks and `$` in pasted evidence survive verbatim:

```bash
cat > "$REPO/CODE-AUDIT.md" <<'CODE_AUDIT_EOF'
# Code Audit — ...
...
CODE_AUDIT_EOF
```

Use a single-quoted delimiter (`'CODE_AUDIT_EOF'`) so the shell performs no expansion. Pick a delimiter that does not appear in the body.

The block below is the **literal file content** to produce. Do NOT copy the outer ```` ```markdown ```` fence into `CODE-AUDIT.md` — it only delimits the template here. Keep the report skimmable. Use this **exact** structure and order:

```markdown
# Code Audit — <repo name> — <env audited>

**Date:** <YYYY-MM-DD HH:MM TZ> · **Auditor:** Claude (/codeaudit, hierarchical)
**Audited commit:** `<short SHA>` on branch `<branch>`
**Verified deployed via:** <method>
**Drift from main:** <N on main not deployed; M deployed not on main; or "none">
**Runtime access:** <what you could verify> · **Limitations:** <what forced `(source-only)`, or "none">
**N/A this codebase:** <minors/majors marked N/A and why, or "none">

---

## Overall grade: <X>

<Two sentences. First: the headline. Second: what blocks a higher grade (name the binding cap) OR what makes this solid.>

**Caps invoked:** <list each triggered hard cap with its one-line evidence, or "none">.

## Report card (hierarchical)

| Major | Grade |
|---|---|
| 1. Architecture & Modularity | **X** |
| 2. Code Maintainability & Readability | **X** |
| 3. Data Model & API Design | **X** |
| 4. Security & Attack Surface | **X** |
| 5. Core Flow Correctness & Spec Conformance | **X** |
| 6. Failure Handling & Failure-State UX | **X** |
| 7. Reliability, Operability & Observability | **X** |
| 8. Testing, CI & Developer Experience | **X** |
| **OVERALL** | **X** |

### 1. Architecture & Modularity — **X** <small>(weighted mean N.NN)</small>
- **1.1 Module decomposition & boundaries — X** — <one line + `file:line`/runtime evidence>
- **1.2 Coupling & cohesion — X** — <one line + evidence>
- **1.3 Layering & dependency direction — X** — <one line + evidence>
- **1.4 Dependency & supply-chain hygiene — X** — <one line + evidence>

### 2. Code Maintainability & Readability — **X** <small>(weighted mean N.NN)</small>
- **2.1 Readability & naming — X** — <one line + evidence>
- **2.2 Dead code & duplication — X** — <one line + evidence>
- **2.3 Type safety — X** — <one line + evidence>
- **2.4 Lint / format enforcement — X** — <one line + evidence>

<...continue identically for Majors 3–8, every minor on one line with its grade + evidence-anchored justification. Show "(weighted mean N.NN)" per major; if a clamp/cap moved the major below its mean band, append e.g. "→ capped C+ (layer inversion)". Mark any N/A minor "— N/A (reason)" and note the renormalized denominator...>

## Strongest findings

<6–12 bullets, ordered by severity. Each cites `file:line`, a SHA, or pasted runtime output (curl/log/scanner/gh-api/DB). These are the things a stakeholder must know — name the cap each one triggers, if any. Don't pad; a short list with no P0s beats a long list of nits.>

## Action plan

| # | Issue | Severity | Effort | Major.Minor | Evidence |
|---|---|---|---|---|---|
| 1 | <one-line> | P0 | S/M/L | 4.1 | `file:line` or runtime evidence |
| 2 | ... | P1 | ... | ... | ... |

Severity — **P0**: fix before next deploy (user-facing harm, security exposure, data loss). **P1**: fix this sprint (operability/correctness gap that bites within weeks). **P2**: backlog with intent (debt, no near-term blast radius).
Effort — **S** (<½ day) · **M** (½–2 days) · **L** (>2 days, may need design). Ordered by `(severity, effort)`: P0/S first.

---

*Audited under /deepgem-coding-config:codeaudit. Grades are hierarchical (8 majors → minors → roll-up → overall) and evidence-anchored to the deployed commit above. Items marked `(source-only)` were not verified against runtime state — see Limitations. This run does not diff against prior audits. No source code was modified.*
```

After saving, print to the user: `Saved CODE-AUDIT.md (overall: <X>).` followed by the top 3 issues as `[P0/P1] <one-line>` lines.

---

How to invoke: `/deepgem-coding-config:codeaudit [path] [env]`

Follow-ons: run `/deepgem-coding-config:code-audit` for deployed-prod depth (runtime-source verification, prior-audit diffing); then `/deepgem-coding-config:qa-review` for a browser-driven UI/UX pass before client handoff.
