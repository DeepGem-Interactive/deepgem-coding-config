---
description: Sweep all worker panes, act on finished/blocked workers, report one-line status each
allowed-tools: Bash
---

Status sweep of every worker pane in the current tmux session. Discover panes live with the Bash tool — never hardcode addresses.

**Step 1 — Discover.** Run:

```
tmux display-message -p 'session=#S window=#I self-pane=#P'
tmux list-panes -F '#{pane_index}: #{pane_current_command}'
```

The workers are every pane **except your own** (`self-pane` above).

**Step 2 — Capture each worker.** For each worker pane index `N`, run:

```
tmux capture-pane -t ":.N" -p | tail -40
```

**Step 3 — Classify and act**, for each worker:
- **working** — leave it.
- **finished** (idle / awaiting follow-up) — dispatch the next step, usually committing the work with a clear, descriptive message, via `/dispatch <pane> "<task>"`, unless the user told you to hold that worker.
- **blocked** (error, prompt waiting on input, failed command) — summarize the cause in one line and propose a fix. Ask before anything destructive.
- **Never** dispatch to your own (Coordinator) pane.

**Step 4 — Report.** End with exactly one status line per worker, in this form:

```
pane N: <working|finished|blocked> — <one-line detail>
```
