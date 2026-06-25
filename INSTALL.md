# Installing deepgem-coding-config

DeepGem's Claude Code plugin: SOW generation, QA review, evidence-anchored code
audits (`/codeaudit`), and a multi-agent tmux orchestrator (`/orch`).

## Install (2 commands, run inside Claude Code)

```
/plugin marketplace add https://github.com/DeepGem-Interactive/deepgem-coding-config
/plugin install deepgem-coding-config@deepgem-config
```

Then **restart Claude Code**.

## Verify

Type `/deepgem` and you should see the commands appear:
`/deepgem-coding-config:codeaudit`, `:orch`, `:monitor`, `:dispatch`, plus
`/create-sow` and other skills.

## Updating to a newer version

`/plugin marketplace update` is unreliable (it can silently stay on the old
commit). The dependable path:

```
git -C ~/.claude/plugins/marketplaces/deepgem-config pull
claude plugin update deepgem-coding-config@deepgem-config
```

then restart Claude Code. Confirm with `claude plugin list` (or check the
version under `~/.claude/plugins/cache/deepgem-config/deepgem-coding-config/`).

## One-time setup for the orchestrator (`/orch`) — only if you'll use it

1. **Run inside tmux** (the orchestrator builds a tmux session of agent panes).
2. **Connect Linear:** in Claude Code run `/mcp`, pick **linear**, authenticate.
3. **Add two workflow states** to your Linear team (Settings → Team → Issue
   statuses): **Bot Review** and **Human Review** — the pipeline needs them.
4. **For hands-off autonomy** (no permission prompts in agent panes), add to
   `~/.zshrc`:
   ```
   export ORCH_CLAUDE_FLAGS="--dangerously-skip-permissions"
   ```
   Open a fresh terminal so it loads, then launch.

## First run

```
tmux                                   # if not already in tmux
claude
/deepgem-coding-config:orch <project>  # builds Coordinator + worker panes
```

Talk only to the Coordinator (pane 0); it dispatches to the workers. For a
one-shot audit instead, just run `/deepgem-coding-config:codeaudit` in any repo.
