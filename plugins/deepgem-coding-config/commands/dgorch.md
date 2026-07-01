---
description: Launch the v2 durable orchestrator (dgorch serve) on a project — plans the PRD, runs isolated workers, mirrors to Linear, parks user-visible work at Human Review, and watches Linear for your verdicts
argument-hint: "<project-name-or-path> [prd-path]"
allowed-tools: Bash, Read, Glob
---

Stand up a **v2 durable orchestrator run** (`dgorch serve`) for a project, detached in tmux so it survives this session. This is the successor to `/orch`: instead of tmux worker panes, workers are isolated per-task git worktrees driven by a crash-safe engine; you review in Linear and the engine notices your verdicts on its own.

The user's input is:

`$ARGUMENTS`

**Step 1 — Resolve the repo.** First token: if it contains a `/` treat it as a path; otherwise it's a project name under `~/Coding projects/<name>`. The directory must exist and be a git repo — if not, say so and stop.

**Step 2 — Resolve the PRD.** Second token if given. Otherwise search the repo for, in order: `prd.md`, `PRD.md`, `docs/*PRD*.md`, `docs/prd*.md` (Glob). If exactly one match, use it and say which. If none or several, list what you found and ask the user to specify — do not guess.

**Step 3 — Preflight (all via Bash, read-only).**
- `dgorch --version` works (if not: `ln -sf ~/.npm-global/bin/dgorch ~/.local/bin/dgorch`, or `npm link` in `~/Coding projects/DeepGem-Config/orchestrator-v2`).
- A Linear key exists (`LINEAR_API_KEY` env or `~/.dgorch/linear.key`). Team key: `LINEAR_TEAM_KEY` env, default `DEE`. If no key, warn: the run will execute but can't mirror to Linear or receive verdicts.
- No tmux session named `dgorch-<name>` already exists (`tmux has-session -t "=dgorch-<name>"`). If one does, report it and how to attach — don't double-launch; two engines on one repo's state db is forbidden.
- If `<repo>/.dgorch/state.sqlite` exists, mention prior runs exist and that `dgorch status --repo <repo> --run <id>` / `dgorch serve --repo <repo> --run <id>` resume them.

**Step 4 — Launch detached.** Run exactly (fill in the resolved values; keep the quoting):

```bash
tmux new-session -d -s "dgorch-<name>" \
  "LINEAR_TEAM_KEY=\"${LINEAR_TEAM_KEY:-DEE}\" dgorch serve \
     --repo \"<repo>\" --prd \"<prd>\" \
     --goal \"Implement the PRD\" --poll-sec 60 \
     2>&1 | tee -a \"<repo>/.dgorch/serve.log\"; \
   echo; echo '[dgorch exited — press any key to close]'; read -k1 -s"
```

Then confirm it started: `sleep 3` and `tmux capture-pane -t "=dgorch-<name>" -p | tail -5`. If the pane shows a fatal error, surface it verbatim.

**Step 5 — Report to the user, concisely:**
- Session: `dgorch-<name>` (running detached). Watch live: `tmux attach -t dgorch-<name>` (detach again with `Ctrl-b d`).
- Log: `<repo>/.dgorch/serve.log`. The run id appears in the log; status: `dgorch status --repo "<repo>" --run <id>`.
- Their job: watch Linear — approve Human Review cards by moving to **Done**, request changes by moving back to **In Progress** with a comment. The engine picks verdicts up on its own (~60s poll) and continues until everything is Done.
- Stop anytime: `tmux kill-session -t dgorch-<name>` — state is durable; resume with `dgorch serve --repo "<repo>" --run <id>`.

Do not run the serve loop in the foreground of this Claude session, and do not launch a second engine against the same repo.

How to invoke: `/deepgem-coding-config:dgorch <project> [prd-path]`
Related: `/deepgem-coding-config:orch` (v1 tmux-pane crew) · `dgorch --help` for the raw CLI.
