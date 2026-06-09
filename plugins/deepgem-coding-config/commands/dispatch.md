---
description: Send a one-off task to a specific worker pane (quote-safe)
argument-hint: "<pane> <task>"
allowed-tools: Bash
---

Send a one-off task to a worker pane in the current tmux session. Downstream tmux quoting is handled for you — the script delivers the task via a paste buffer, so quotes, `$`, and backticks survive intact.

The user's input is:

`$ARGUMENTS`

The first whitespace-delimited token is the target pane number; the remainder is the task text. Run the dispatch script with the Bash tool, passing the **entire input as a single shell argument**:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/dispatch.sh" '<pane> <task>'
```

Quote it as ONE argument. If the task text itself contains a single quote, write it to a temp file and read it in, or use a quoting style that preserves it — the script only needs the whole `<pane> <task>` string as `$1`.

Then confirm to the user what was sent and to which pane, based on the script output. Never dispatch to your own (Coordinator) pane.
