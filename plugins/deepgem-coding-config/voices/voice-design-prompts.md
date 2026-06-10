# Crew Voice Design Prompts (ElevenLabs)

Voice Design prompts for the orchestrator crew. Each is written as a **vocal
archetype** — timbre, accent, pacing, attitude — and deliberately does **not**
name any copyrighted character, because ElevenLabs prohibits cloning
named/celebrity/IP voices ([Use Policy](https://elevenlabs.io/use-policy)). The
character comes through the *sound*, not an imitation. The voice you design from
a description is yours to use.

## How to use these
1. Set your key: `export ELEVENLABS_API_KEY=sk_...`
2. Run `bash scripts/voice-design.sh` — it auditions all five (3 previews each)
   and saves `.mp3`s to `~/voice-auditions/`.
3. Listen, pick the best preview per character, note its `generated_voice_id`.
4. Save it to a permanent voice (see the script footer) → record the returned
   `voice_id` in `voices/voice-ids.md` for the comment-audio integration.

Settings: `model_id eleven_ttv_v3`, `guidance_scale 6` (raise toward 8 for
stronger adherence, lower toward 3 for more natural variation).

---

## Optimus Prime — the Coordinator
**voice_description:**
> A deep, resonant adult male voice in his prime — heroic and commanding, with
> warm, reassuring authority and a measured, deliberate cadence. Noble and
> steady, like a battle-tested leader rallying his team before a mission. A
> faint metallic resonance underneath, as if lightly mechanized. Confident,
> calm, and never rushed.

**preview text:**
> Team, the plan is set. Bender takes the hub layout. Mario takes the trail.
> C-3PO runs the build and reports the odds. Yoda reviews the diff. We move
> together, and we ship together. Roll out.

---

## Bender — worker
**voice_description:**
> A brash, nasal adult male robot voice with a buzzy metallic edge and a lazy,
> swaggering delivery. Sarcastic, cynical, and comedic — the voice of a
> wisecracking machine who is certain he is the smartest one in the room.
> Mid-pitched and gravelly, with a big-city attitude.

**preview text:**
> Oh great, another ticket. Relax, I got it. I rewrote the whole component, it
> compiles, and it is cleaner than your commit history. Tests are green. You are
> welcome. Now if anyone needs me, I will be idling in pane one.

---

## Mario — worker
**voice_description:**
> An upbeat, high-spirited adult male cartoon voice with an exaggerated, playful
> Italian accent. Bright, bouncy, and energetic, full of cheerful enthusiasm and
> warmth. Friendly and a little goofy — the voice of a plucky cartoon hero who
> loves his work.

**preview text:**
> Okay, here we go! I finished the trail screen — the buttons bounce just right,
> and the colors match the render perfectly. I tested it at phone size, no
> scrolling, everything fits. One screenshot for you to see. Let us go!

---

## C-3PO — worker
**voice_description:**
> A prim, anxious adult male robot voice with a clipped, upper-class British
> accent and a fussy, precise delivery. Perpetually worried and over-polite,
> forever calculating risks and fretting about what could go wrong, yet
> unfailingly courteous. A faint metallic sheen to the timbre.

**preview text:**
> Oh dear. I have completed the report page, but I really must warn you — the
> chance of a layout regression on smaller screens is approximately one in
> fourteen. I have tested it thoroughly and it does build. Still, I do think you
> ought to examine the screenshots. How distressing.

---

## Yoda — worker
**voice_description:**
> An ancient, diminutive sage's voice — high-pitched and raspy with a gentle,
> weathered gravel. Slow, deliberate, and patient, full of calm wisdom and quiet
> humor. Soft-spoken but knowing, as if every word has been considered for
> centuries.

**preview text:**
> Finished the review, I have. Clean, the diff is. One concern, there is —
> handle the empty state, you must, or fail the build it will. Tested the happy
> path, I did. Approve it you may, when ready you are. Hmm.

---

## Saving a chosen preview (capture the voice_id)
After auditioning, save your favorite preview to a permanent voice:

```bash
curl -sS -X POST https://api.elevenlabs.io/v1/text-to-voice \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"voice_name":"Bender","voice_description":"<same description>","generated_voice_id":"<id from audition>"}'
```

The response includes a permanent `voice_id`. Record each in `voice-ids.md`:

```
Optimus Prime : <voice_id>
Bender        : <voice_id>
Mario         : <voice_id>
C-3PO         : <voice_id>
Yoda          : <voice_id>
```

Those ids are what the (future) Linear voice-note integration will call with the
TTS API to speak each crew member's comments.
