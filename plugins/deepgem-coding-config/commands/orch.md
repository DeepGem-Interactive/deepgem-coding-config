---
description: Launch or reattach a multi-agent orchestrator tmux session (Coordinator + workers)
argument-hint: "<project-name> [path]"
allowed-tools: Bash
---

Build (or reattach to) the orchestrator tmux layout for a project, then report status.

Run the launcher script with the Bash tool, passing the user's arguments. The user's input is:

`$ARGUMENTS`

The first token is the project (tmux session) name; an optional second token is the working-directory path. Run exactly:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/orch.sh" $ARGUMENTS
```

(If the path contains spaces, quote it as a single shell argument.)

Then, based on the script's output:
- On success — tell the user the session is ready and how to switch to it (relay the `tmux switch-client` / `tmux attach` line from the output).
- On failure (missing project path, tmux not installed) — surface the error clearly and suggest the fix.

Do not type into any worker pane yourself. The Coordinator running in pane 0 owns dispatch; the human talks only to it.
