#!/usr/bin/env bash
#
# dispatch.sh — Send a one-off task to a worker pane in the current tmux session.
#
# Quote-safe: the task text is loaded into a tmux paste buffer and pasted into
# the target pane, so embedded quotes, backticks, and $ never reach a shell or
# get mangled by send-keys word-splitting. A final Enter submits it.
#
# Usage:  dispatch.sh "<pane> <task...>"
#   The whole argument is one string; the first whitespace-delimited token is the
#   target pane index, the remainder is the task. Example:
#       dispatch.sh "1 commit the auth changes with a descriptive message"
#
set -euo pipefail

die() { printf 'dispatch: %s\n' "$1" >&2; exit 1; }

command -v tmux >/dev/null 2>&1 || die "tmux is not installed or not on PATH."
tmux display-message -p '#S' >/dev/null 2>&1 \
  || die "not inside a tmux session — run /dispatch from the Coordinator pane."

INPUT="${1:-}"
[ -n "$INPUT" ] || die "usage: /dispatch <pane> <task>"

PANE="${INPUT%%[[:space:]]*}"   # first token
TASK="${INPUT#"$PANE"}"          # everything after the pane token
TASK="${TASK#"${TASK%%[![:space:]]*}"}"   # strip leading whitespace

[ -n "$TASK" ] || die "no task text provided. usage: /dispatch <pane> <task>"
case "$PANE" in
  ''|*[!0-9]*) die "pane must be a number, got: '$PANE'" ;;
esac

SESSION="$(tmux display-message -p '#S')"
WIN="$(tmux display-message -p '#I')"
SELF="$(tmux display-message -p '#P')"
TARGET="$SESSION:$WIN.$PANE"

[ "$PANE" != "$SELF" ] || die "refusing to dispatch to pane $PANE (yourself / the Coordinator)."

tmux list-panes -t "$SESSION:$WIN" -F '#{pane_index}' | grep -qx "$PANE" \
  || die "pane $PANE does not exist in session '$SESSION' window $WIN."

# Quote-safe delivery via a named paste buffer.
BUF="dgi-dispatch"
printf '%s' "$TASK" | tmux load-buffer -b "$BUF" -
tmux paste-buffer -t "$TARGET" -b "$BUF" -d
tmux send-keys -t "$TARGET" Enter

printf "dispatch: sent to %s -> %s\n" "$TARGET" "$TASK"
