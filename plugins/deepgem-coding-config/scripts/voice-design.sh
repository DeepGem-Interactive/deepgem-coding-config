#!/usr/bin/env bash
#
# voice-design.sh — Audition the crew's ElevenLabs Voice Design prompts.
#
# For each character it calls the Voice Design API (returns 3 previews) and
# saves every preview as an .mp3 you can listen to, printing each preview's
# generated_voice_id so you can save your favorite later.
#
# Usage:
#   export ELEVENLABS_API_KEY=sk_...
#   bash scripts/voice-design.sh [output-dir]
#
# Optional env: TTV_MODEL (default eleven_ttv_v3), TTV_GUIDANCE (default 6).
#
# Prompts live in voices/voice-design-prompts.md — keep the two in sync.
#
set -euo pipefail

: "${ELEVENLABS_API_KEY:?Set ELEVENLABS_API_KEY first (export ELEVENLABS_API_KEY=sk_...)}"
command -v python3 >/dev/null 2>&1 || { echo "voice-design: python3 is required." >&2; exit 1; }

OUT="${1:-$HOME/voice-auditions}"
MODEL="${TTV_MODEL:-eleven_ttv_v3}"
GUIDANCE="${TTV_GUIDANCE:-6}"
mkdir -p "$OUT"

design() {
  name="$1"; desc="$2"; text="$3"
  echo "▶ Designing $name …"
  body=$(python3 - "$desc" "$text" "$MODEL" "$GUIDANCE" <<'PY'
import json, sys
desc, text, model, guidance = sys.argv[1:5]
print(json.dumps({
    "voice_description": desc,
    "text": text,
    "model_id": model,
    "guidance_scale": float(guidance),
}))
PY
)
  curl -sS -X POST "https://api.elevenlabs.io/v1/text-to-voice/design" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$body" \
  | python3 - "$OUT" "$name" <<'PY'
import json, sys, base64, os
out, name = sys.argv[1], sys.argv[2]
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    print("  ! bad response:", raw[:300]); sys.exit(1)
previews = data.get("previews") or []
if not previews:
    print("  ! no previews returned:", json.dumps(data)[:300]); sys.exit(1)
for i, p in enumerate(previews, 1):
    b64 = p.get("audio_base_64") or p.get("audio_base64")
    gid = p.get("generated_voice_id", "?")
    fn = os.path.join(out, f"{name}-{i}.mp3")
    with open(fn, "wb") as f:
        f.write(base64.b64decode(b64))
    print(f"  ✓ {fn}   generated_voice_id={gid}")
PY
}

# --- The crew. Keep descriptions/preview text in sync with the prompts doc. ---

design "Optimus Prime" \
"A deep, resonant adult male voice in his prime — heroic and commanding, with warm, reassuring authority and a measured, deliberate cadence. Noble and steady, like a battle-tested leader rallying his team before a mission. A faint metallic resonance underneath, as if lightly mechanized. Confident, calm, and never rushed." \
"Team, the plan is set. Bender takes the hub layout. Mario takes the trail. C-3PO runs the build and reports the odds. Yoda reviews the diff. We move together, and we ship together. Roll out."

design "Bender" \
"A brash, nasal adult male robot voice with a buzzy metallic edge and a lazy, swaggering delivery. Sarcastic, cynical, and comedic — the voice of a wisecracking machine who is certain he is the smartest one in the room. Mid-pitched and gravelly, with a big-city attitude." \
"Oh great, another ticket. Relax, I got it. I rewrote the whole component, it compiles, and it is cleaner than your commit history. Tests are green. You are welcome. Now if anyone needs me, I will be idling in pane one."

design "Mario" \
"An upbeat, high-spirited adult male cartoon voice with an exaggerated, playful Italian accent. Bright, bouncy, and energetic, full of cheerful enthusiasm and warmth. Friendly and a little goofy — the voice of a plucky cartoon hero who loves his work." \
"Okay, here we go! I finished the trail screen — the buttons bounce just right, and the colors match the render perfectly. I tested it at phone size, no scrolling, everything fits. One screenshot for you to see. Let us go!"

design "C-3PO" \
"A prim, anxious adult male robot voice with a clipped, upper-class British accent and a fussy, precise delivery. Perpetually worried and over-polite, forever calculating risks and fretting about what could go wrong, yet unfailingly courteous. A faint metallic sheen to the timbre." \
"Oh dear. I have completed the report page, but I really must warn you — the chance of a layout regression on smaller screens is approximately one in fourteen. I have tested it thoroughly and it does build. Still, I do think you ought to examine the screenshots. How distressing."

design "Yoda" \
"An ancient, diminutive sage's voice — high-pitched and raspy with a gentle, weathered gravel. Slow, deliberate, and patient, full of calm wisdom and quiet humor. Soft-spoken but knowing, as if every word has been considered for centuries." \
"Finished the review, I have. Clean, the diff is. One concern, there is — handle the empty state, you must, or fail the build it will. Tested the happy path, I did. Approve it you may, when ready you are. Hmm."

echo
echo "Done. Auditions saved to: $OUT"
echo "Listen, pick a favorite per character, then save it to a permanent voice:"
echo
echo "  curl -sS -X POST https://api.elevenlabs.io/v1/text-to-voice \\"
echo "    -H \"xi-api-key: \$ELEVENLABS_API_KEY\" -H \"Content-Type: application/json\" \\"
echo "    -d '{\"voice_name\":\"Bender\",\"voice_description\":\"…\",\"generated_voice_id\":\"<id>\"}'"
echo
echo "Record each returned voice_id in voices/voice-ids.md."
