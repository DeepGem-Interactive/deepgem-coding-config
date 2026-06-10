#!/usr/bin/env bash
#
# orch.sh — Build (or reattach to) a multi-agent orchestrator tmux session.
#
# Layout: Coordinator in a large left pane (the tmux "main" pane) with N worker
# panes stacked on the right, via the `main-vertical` layout. The Coordinator
# pane launches Claude with the plugin's coordinator role appended to its system
# prompt, so it acts as the Coordinator from its first message with no paste.
#
# Usage:  orch.sh <project-name> [path]
#   <project-name>  tmux session name (required)
#   [path]          working dir for all panes (default: $PROJECTS_ROOT/<name>)
#
# ---------------------------------------------------------------------------
# CONFIG — change these in one place.
# ---------------------------------------------------------------------------
WORKERS="${ORCH_WORKERS:-3}"                       # number of worker panes
PROJECTS_ROOT="${ORCH_PROJECTS_ROOT:-$HOME/Coding projects}"  # default project parent dir
MAIN_WIDTH="${ORCH_MAIN_WIDTH:-60%}"              # width of the Coordinator (left) pane
CLAUDE_FLAGS="${ORCH_CLAUDE_FLAGS:-}"             # extra flags for EVERY pane's claude
#   e.g. export ORCH_CLAUDE_FLAGS="--dangerously-skip-permissions" for full
#   autonomy (no permission prompts in any pane), or "--permission-mode
#   acceptEdits" to auto-approve edits only. Default: normal prompting.
WORKER_CMD="${ORCH_WORKER_CMD:-claude${CLAUDE_FLAGS:+ $CLAUDE_FLAGS}}"  # worker startup command
# Bobiverse worker roster (first worker = Bill). Keep in sync with the
# "Crew identities" roster in roles/coordinator-role.md so Bob's mapping and
# each worker's self-identity agree. Workers boot already knowing their name.
ROSTER=(Bill Garfield Riker Homer Mario Luigi Marvin Khan)
#   For git-worktree isolation per worker, swap WORKER_CMD to:
#       WORKER_CMD="claude -w feat/\$PROJECT"
#   (each worker then runs in its own worktree branch). See README.
# ---------------------------------------------------------------------------

set -euo pipefail

# Resolve the plugin root from this script's own location (robust whether or not
# CLAUDE_PLUGIN_ROOT is exported into the subshell).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
ROLE_FILE="$PLUGIN_ROOT/roles/coordinator-role.md"

die() { printf 'orch: %s\n' "$1" >&2; exit 1; }

command -v tmux >/dev/null 2>&1 || die "tmux is not installed or not on PATH."

PROJECT="${1:-}"
[ -n "$PROJECT" ] || die "usage: /orch <project-name> [path]"

# ---------------------------------------------------------------------------
# Reattach if the session already exists (no project path needed to reattach).
# ---------------------------------------------------------------------------
if tmux has-session -t "=$PROJECT" 2>/dev/null; then
  printf "orch: session '%s' already exists — reattaching.\n" "$PROJECT"
  if [ -n "${TMUX:-}" ]; then
    tmux switch-client -t "=$PROJECT" 2>/dev/null \
      && printf "orch: switched to session '%s'.\n" "$PROJECT" \
      || printf "orch: run: tmux switch-client -t %s\n" "$PROJECT"
  else
    printf "orch: run: tmux attach -t %s\n" "$PROJECT"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Building a fresh session — the project dir and role file must exist.
# ---------------------------------------------------------------------------
PROJECT_DIR="${2:-$PROJECTS_ROOT/$PROJECT}"
[ -d "$PROJECT_DIR" ] || die "project path does not exist: $PROJECT_DIR
       create it first, or pass an explicit path: /orch $PROJECT <path>"

[ -f "$ROLE_FILE" ] || die "coordinator role file missing: $ROLE_FILE"

# pane 0 (Coordinator) + WORKERS panes.
tmux new-session -d -s "$PROJECT" -c "$PROJECT_DIR"

# Window index is whatever tmux's base-index produced (don't assume 0).
WIN="$(tmux list-windows -t "=$PROJECT" -F '#{window_index}' | head -n1)"
WT="$PROJECT:$WIN"   # window target

i=1
while [ "$i" -le "$WORKERS" ]; do
  tmux split-window -t "$WT" -c "$PROJECT_DIR"
  i=$((i + 1))
done

# main-vertical: first pane becomes the large left pane; rest stack on the right.
tmux set-window-option -t "$WT" main-pane-width "$MAIN_WIDTH" >/dev/null 2>&1 || true
tmux select-layout -t "$WT" main-vertical >/dev/null

# Collect pane indices in ascending order (bash 3.2 compatible — no mapfile).
PANES=()
while IFS= read -r p; do PANES+=("$p"); done < <(
  tmux list-panes -t "$WT" -F '#{pane_index}' | sort -n
)

COORD_PANE="${PANES[0]}"

# Start workers (every pane except the Coordinator). Each worker boots with its
# own Bobiverse identity appended to its system prompt, so it knows who it is
# from its first message — unless ORCH_WORKER_CMD overrides the launch command.
wi=0
for p in "${PANES[@]}"; do
  if [ "$p" = "$COORD_PANE" ]; then continue; fi
  if [ -n "${ORCH_WORKER_CMD:-}" ]; then
    tmux send-keys -t "$WT.$p" "$ORCH_WORKER_CMD" Enter
  else
    NAME="${ROSTER[$wi]:-Clone$((wi + 1))}"
    IDENTITY="You are ${NAME}, a worker clone in tmux pane ${p} of a Bobiverse multi-agent coding crew. The Coordinator (Bob) in pane 0 dispatches every task to you and is the only one who talks to the human; never expect input from the human directly. Do the task Bob gives you, stay strictly within the files in its stated scope, and report status concisely in this pane when you finish or get blocked. Bob owns Linear and git; you focus on the code. If asked who you are, you are ${NAME}."
    tmux send-keys -t "$WT.$p" "claude${CLAUDE_FLAGS:+ $CLAUDE_FLAGS} --append-system-prompt \"$IDENTITY\"" Enter
  fi
  wi=$((wi + 1))
done

# Start the Coordinator: Claude with the role appended to its system prompt.
# The cat runs inside the pane's shell, so the typed command stays short.
if [ -n "${ORCH_COORD_CMD:-}" ]; then
  COORD_CMD="$ORCH_COORD_CMD"                       # test/override hook
else
  COORD_CMD="claude${CLAUDE_FLAGS:+ $CLAUDE_FLAGS} --append-system-prompt \"\$(cat \"$ROLE_FILE\")\""
fi
tmux send-keys -t "$WT.$COORD_PANE" "$COORD_CMD" Enter
tmux select-pane -t "$WT.$COORD_PANE"

# ---------------------------------------------------------------------------
# Report + switch.
# ---------------------------------------------------------------------------
printf "orch: built session '%s' (%s workers) in %s\n" "$PROJECT" "$WORKERS" "$PROJECT_DIR"
printf "orch: pane map -> coordinator=%s, workers=%s\n" "$COORD_PANE" "$(
  for p in "${PANES[@]}"; do [ "$p" = "$COORD_PANE" ] || printf '%s ' "$p"; done
)"

if [ -n "${TMUX:-}" ]; then
  tmux switch-client -t "=$PROJECT" 2>/dev/null \
    && printf "orch: switched to session '%s'.\n" "$PROJECT" \
    || printf "orch: ready — run: tmux switch-client -t %s\n" "$PROJECT"
else
  printf "orch: ready — run: tmux attach -t %s\n" "$PROJECT"
fi
