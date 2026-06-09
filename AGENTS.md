# DeepGem Config

Claude Code plugin marketplace for DeepGem Interactive's project management methodology.

## Installation

```bash
# Add the marketplace
/plugin marketplace add https://github.com/DeepGem-Interactive/deepgem-coding-config

# Install the plugin
/plugin install deepgem-coding-config
```

## Available Plugins

### deepgem-coding-config

SOW generation, QA review orchestration, and multi-agent tmux orchestration for DeepGem's development process.

**Skills:**
- `/deepgem-coding-config:create-sow` - Generate a Statement of Work from meeting notes
- `/deepgem-coding-config:qa-review` - Comprehensive QA review with code review, UI polish, and browser testing

**Commands (multi-agent orchestrator):**
- `/deepgem-coding-config:orch <project> [path]` - Launch (or reattach to) a tmux session with a Coordinator pane + worker panes
- `/deepgem-coding-config:monitor` - Sweep all worker panes, act on finished/blocked ones, report one-line status each
- `/deepgem-coding-config:dispatch <pane> <task>` - Send a one-off, quote-safe task to a specific worker pane

## Usage

### Create SOW

```
/deepgem-coding-config:create-sow
```

The skill will:
1. Ask for meeting notes (paste text, file path, or describe)
2. Extract client info, deliverables, and commercial terms
3. Ask clarifying questions (rate, hours, dates)
4. Generate a complete SOW in DeepGem format

### QA Review

```
/deepgem-coding-config:qa-review
```

The skill will:
1. Ask what to review (branch changes, directory, or full project)
2. Ask for browser testing URL and user flows
3. Run in parallel: multi-review (code), polish-sweep (UI), browser automation
4. Generate consolidated `qa-review-report.md`
5. Present findings and require fix/wontfix decisions
6. Require justification for any wontfix on critical/high issues
7. Apply fixes and optionally re-run verification

### Orchestrator (multi-agent tmux)

Collapses the manual multi-agent tmux workflow into slash commands. You talk only
to the **Coordinator**; it dispatches to and reads back from the workers.

```
/deepgem-coding-config:orch shinesty
```

Builds a tmux session named `shinesty` with a large left **Coordinator** pane and
three worker panes (`main-vertical` layout). Each worker runs `claude`; the
Coordinator runs `claude` with the role in `roles/coordinator-role.md` appended to
its system prompt, so it acts as Coordinator from its first message — no paste.
Re-running on an existing session reattaches instead of rebuilding.

- Working dir defaults to `~/coding-projects/<project>`; override with a second arg:
  `/deepgem-coding-config:orch shinesty ~/work/shinesty`
- Prerequisite: run from inside tmux so pane targeting works.

Once attached, state the goal once to the Coordinator. It plans, dispatches one
task per idle worker, polls with `/monitor` every 1–2 minutes while work is in
flight, and commits finished work — without you typing into any worker pane.

**Configuration** (all in `scripts/orch.sh`, top of file — one place to change):
- `WORKERS=3` — number of worker panes.
- `MAIN_WIDTH=60%` — width of the Coordinator pane.
- `WORKER_CMD="claude"` — worker startup command. For git-worktree isolation per
  worker, swap to `WORKER_CMD="claude -w feat/$PROJECT"` (documented option, off
  by default).

**Testing local edits before committing:** the installed plugin is a cached copy
from the marketplace, *not* this working tree, so editing files here does not
affect the installed `/orch` command. To run the live working-tree version:

```bash
claude --plugin-dir "$(pwd)/plugins/deepgem-coding-config"
```

**Refreshing the installed plugin after committing:** this plugin is installed
from the `deepgem-config` marketplace (a GitHub clone), so a plain `git pull` of
this repo does **not** update it. Publish and refresh:

1. Commit and push to `https://github.com/DeepGem-Interactive/deepgem-coding-config`.
2. `/plugin marketplace update deepgem-config` — pull the new marketplace state.
3. `/plugin update deepgem-coding-config` — install the new version into the cache.

> Note: this plugin is currently installed from **two** marketplaces
> (`deepgem-config` and `ai-coding-config`). Update/enable the one you intend to
> use to avoid running a stale copy.

## Structure

```
.claude-plugin/marketplace.json    # Marketplace manifest
plugins/
└── deepgem-coding-config/
    ├── .claude-plugin/plugin.json # Plugin manifest
    ├── commands/                  # Slash commands (auto-discovered)
    │   ├── orch.md                # /orch — build/reattach orchestrator layout
    │   ├── monitor.md             # /monitor — status sweep of worker panes
    │   └── dispatch.md            # /dispatch — quote-safe task to a pane
    ├── roles/
    │   └── coordinator-role.md    # Coordinator system prompt (one file for role changes)
    ├── scripts/
    │   ├── orch.sh                # tmux layout builder (one file for layout changes)
    │   └── dispatch.sh            # quote-safe send-keys via paste buffer
    ├── skills/
    │   ├── create-sow/            # SOW generation skill
    │   ├── create-sprint/         # Sprint plan skill
    │   ├── qa-review/SKILL.md     # QA review orchestration skill
    │   └── code-audit/SKILL.md    # Code audit skill
    └── knowledge/
        ├── templates/             # SOW template
        ├── processes/             # PM methodology
        ├── examples/              # Real examples
        └── product/               # Vision, personas
```
