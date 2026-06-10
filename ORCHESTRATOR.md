# DeepGem Orchestrator — One-Pager

One tmux session per project. A **Coordinator** Claude in the big left pane, three
**worker** Claudes stacked on the right. You talk only to the Coordinator. It
breaks your PRD into tasks, dispatches them to workers, checks the results,
commits finished work, and tracks progress in a file that survives restarts.

## The flow

```
You ──PRD──▶ Coordinator ──tasks──▶ Workers (×3)
                 │                      │
                 │◀──── /monitor ───────┘
                 ▼
        verify → commit → next task
                 ▼
        .orch/plan.md  (progress, survives restarts)
```

1. **Start:** in a terminal, run `tmux`, then `claude`, then
   `/deepgem-coding-config:orch <project>` (add a path if the project isn't in
   `~/Coding projects/<project>`).
2. **Brief it:** paste your PRD (or a file path to it) into the Coordinator pane.
   It writes the task plan to `.orch/plan.md`, shows it, then starts dispatching.
3. **Walk away.** The Coordinator polls workers every 1–2 minutes, verifies
   finished work before committing, and re-tasks idle workers.
4. **Check in:** ask the Coordinator "status?" or run `/monitor` yourself.
5. **Resume later:** rerun `/orch <project>` — it reattaches if the session is
   alive, rebuilds if not. Either way the Coordinator reads `.orch/plan.md` and
   picks up where it left off.

## Commands you need

| Command | What it does |
|---|---|
| `/deepgem-coding-config:orch <project> [path]` | Build or reattach the session |
| `/deepgem-coding-config:monitor` | Status sweep — one line per worker |
| `/deepgem-coding-config:dispatch <pane> <task>` | Manually send a task to one worker |
| `tmux ls` | List all sessions |
| `tmux attach -t <project>` | Attach from a plain terminal |
| `Ctrl-b d` | Detach (everything keeps running) |
| `Ctrl-b` + arrows / `Ctrl-b q` | Move between panes / jump by number |
| `Ctrl-b z` | Zoom a pane fullscreen (again to undo) |
| `Ctrl-b [` | Scroll a pane (`q` to exit) |

## Config (env vars, set before running /orch)

- `ORCH_WORKERS=3` — number of workers
- `ORCH_MAIN_WIDTH=60%` — Coordinator pane width
- `ORCH_WORKER_CMD="claude"` — worker launch command

## Tips

- **Workers stuck at permission prompts?** Launch with
  `ORCH_WORKER_CMD="claude --permission-mode acceptEdits"` for fewer
  interruptions (workers can then edit files without asking each time).
- **One session per project.** The session name *is* the project name; rerunning
  `/orch` with the same name never destroys anything.
- **Plugin updates:** push to GitHub, then `/plugin marketplace update
  deepgem-config` and `/plugin update deepgem-coding-config`. If the update
  looks stale, `git -C ~/.claude/plugins/marketplaces/deepgem-config pull` first.
