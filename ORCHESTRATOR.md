# DeepGem Orchestrator — One-Pager

One tmux session per project. A **Coordinator** Claude in the big left pane, three
**worker** Claudes stacked on the right. You talk only to the Coordinator. It
breaks your PRD into Linear issues, dispatches them to workers, checks the
results, commits finished work, and moves the issues through Linear — so you
can watch progress from the Linear app, and progress survives restarts.

## The flow

```
You ──PRD──▶ Coordinator ──tasks──▶ Workers (×3)
                 │                      │
                 │◀──── /monitor ───────┘
                 ▼
   verify → commit → bot review (different worker)
                 ▼
   Todo → In Progress → Bot Review → Human Review → Done
                                    (backend skips ────▲)

   Human Review (front-end, in the Linear app):
     approve = drag to Done
     deny    = drag to In Progress + comment what's wrong
```

1. **Start:** in a terminal, run `tmux`, then `claude`, then
   `/deepgem-coding-config:orch <project>` (add a path if the project isn't in
   `~/Coding projects/<project>`).
2. **Brief it:** paste your PRD (or a file path to it) into the Coordinator pane.
   First time in a project it asks which Linear team to use, then creates one
   Linear issue per task, shows the plan, and starts dispatching.
3. **Walk away.** The Coordinator polls workers every 1–2 minutes, verifies and
   commits finished work, then sends every change through **bot review** by a
   different worker. Front-end changes get screenshots and an app walkthrough,
   then land in **Human Review** for you. Backend changes that pass review go
   straight to Done.
4. **Review in Linear:** approve by dragging to Done; deny by dragging back to
   In Progress with a comment — your comment becomes the fix task. If
   everything is waiting on you, the Coordinator pauses; nudge it with "check
   Linear" when you've reviewed.
5. **Resume later:** rerun `/orch <project>` — it reattaches if the session is
   alive, rebuilds if not. Either way the Coordinator queries Linear for open
   issues and picks up where it left off. Issues you add or reprioritize in
   Linear between sessions are honored.

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
- `ORCH_CLAUDE_FLAGS=""` — extra flags for every pane's claude. Set
  `"--dangerously-skip-permissions"` for full autonomy (no permission prompts;
  use in trusted projects — your safety net is bot review + the Linear gate),
  or `"--permission-mode acceptEdits"` to auto-approve edits only.
- `ORCH_WORKER_CMD="claude"` — worker launch command (overrides flags entirely)

## Tips

- **Linear auth (one time):** the Linear MCP server is configured at user
  scope. In any claude session run `/mcp`, pick **linear**, and complete the
  OAuth login. Coordinators handle the rest.
- **Workflow states (one time per team):** add **Bot Review** and **Human
  Review** states in Linear (Settings → Team → Workflow). The Coordinator
  checks for them and will ask if they're missing.
- **Screenshots in Linear:** the Coordinator attaches images directly if the
  Linear tools support uploads; otherwise it commits them under
  `.orch/screenshots/` and links the paths in the issue comment.
- **Workers stuck at permission prompts?** Set `ORCH_CLAUDE_FLAGS` (above) in
  your `~/.zshrc` and rebuild the session. For an already-running pane,
  Shift+Tab cycles its permission mode without relaunching.
- **One session per project.** The session name *is* the project name; rerunning
  `/orch` with the same name never destroys anything.
- **Plugin updates:** push to GitHub, then `/plugin marketplace update
  deepgem-config` and `/plugin update deepgem-coding-config`. If the update
  looks stale, `git -C ~/.claude/plugins/marketplaces/deepgem-config pull` first.
