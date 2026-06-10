#!/usr/bin/env bash
#
# voice-note.sh — Generate a short spoken voice note in a crew member's voice.
#
# The Coordinator calls this to turn a Linear comment into audio, then attaches
# the resulting .mp3 to the issue (Linear upload if supported, else commit it
# under .orch/voicenotes/ and link the path) — the same flow as screenshots.
#
# Usage:
#   voice-note.sh "<CrewName>" "<text to speak>" [output.mp3]
#   e.g. voice-note.sh Bender "Rebuilt the hub. Tests green. Approve if you like it." \
#          .orch/voicenotes/DEE-12-bender.mp3
#
# Prints the path to the generated .mp3 on success.
#
# Key: reads ELEVENLABS_API_KEY from the environment, or falls back to the file
# ~/.elevenlabs_key. Voice ids are kept in sync with voices/voice-ids.md.
#
set -euo pipefail

KEY="${ELEVENLABS_API_KEY:-}"
[ -n "$KEY" ] || KEY="$(cat "$HOME/.elevenlabs_key" 2>/dev/null || true)"
[ -n "$KEY" ] || { echo "voice-note: no ElevenLabs key (set ELEVENLABS_API_KEY or ~/.elevenlabs_key)" >&2; exit 1; }

NAME="${1:-}"; TEXT="${2:-}"; OUT="${3:-}"
[ -n "$NAME" ] && [ -n "$TEXT" ] || { echo "voice-note: usage: voice-note.sh \"<CrewName>\" \"<text>\" [out.mp3]" >&2; exit 1; }

# Crew name -> permanent ElevenLabs voice_id (see voices/voice-ids.md).
case "$NAME" in
  "Optimus Prime"|Optimus|optimus)  VID="fxIdnca6XzhunepK9LHH" ;;
  Bender|bender)                     VID="UfCYMFY2E2T1DMVqxTyL" ;;
  Mario|mario)                       VID="LUPvMZeLdxGLrlmw1jAF" ;;
  "C-3PO"|C-3PO|C3PO|c3po)           VID="XqW4XEVMkanB3VP1L94X" ;;
  Yoda|yoda)                         VID="7IcVMdF5NO1USwxAkTk2" ;;
  *) echo "voice-note: unknown crew voice '$NAME' (have: Optimus Prime, Bender, Mario, C-3PO, Yoda)" >&2; exit 1 ;;
esac

MODEL="${TTS_MODEL:-eleven_multilingual_v2}"
if [ -z "$OUT" ]; then OUT="$(mktemp -t voicenote).mp3"; fi
mkdir -p "$(dirname "$OUT")"

body=$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"model_id":sys.argv[2]}))' "$TEXT" "$MODEL")
code=$(curl -sS -o "$OUT" -w '%{http_code}' \
  -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VID" \
  -H "xi-api-key: $KEY" -H "Content-Type: application/json" -d "$body" || echo "000")

if [ "$code" != "200" ]; then
  echo "voice-note: TTS HTTP $code — $(head -c 300 "$OUT" 2>/dev/null)" >&2
  rm -f "$OUT"; exit 1
fi
echo "$OUT"
