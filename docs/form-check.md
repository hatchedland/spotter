# Form check

The user films one set. The video never leaves their device: the browser tracks the body, measures
the set, picks a few key frames, and sends only the numbers and those frames to
`POST /api/v1/form-reviews` for one coaching call to Gemini.

## Pipeline

1. **Sample** the clip (2–60 s) at 12 frames/s, or 8 frames/s over 30 s.
   `src/lib/client/pose-tracker.ts`
2. **Track** the body on each sample with MediaPipe Pose (on-device; the WASM engine is fetched
   from jsdelivr on first use).
3. **Measure**: joint signal per frame, rep detection, range of motion, tempo, torso swing, side
   difference, form flags. `src/lib/analysis/*`
4. **Pick key frames** and draw the tracked skeleton on them as JPEGs.
5. **Review**: send metrics (~2 KB) and the key frames to the server, which makes one Gemini call.
   The model treats the numbers as ground truth and uses frames for posture, grip and setup.

## Why it is cheap

No video upload, storage or server-side processing; pose tracking costs nothing on our side; one
small multimodal call per set instead of sending the whole video to the model.

## Changes

### 2026-11-12: Add the worst middle rep as a key frame

**Problem.** Key frames are the start and end position of rep 1 and the end of the last rep. A bad
rep in the middle of the set only reaches the coach as numbers, never as an image, so the coach
can't comment on what went wrong visually.

**Plan.**
1. Move key frame selection out of `form-check-flow.tsx` into a pure, unit-tested function in
   `src/lib/analysis/keyframes.ts`.
2. Among the middle reps (not first, not last), score each:
   - **Range shortfall**: how far short of the rep's target range it falls, i.e.
     `1 - |peak - start| / |targetEnd - targetStart|`.
   - **Rushed lowering**: lowering time well below the set's median lowering time.
3. If the worst middle rep falls short by at least 15% of the target range, or lowers in under 70%
   of the median time, add a fourth frame:
   - range problem → its end position (`peakSec`), labelled "End position of rep N (shortest range)"
   - rushed lowering → mid-lowering (`(peakSec + endSec) / 2`), labelled
     "Lowering of rep N (fastest lowering)"
   Range wins if both apply. No fourth frame when there are fewer than three reps or no middle rep
   stands out, so normal sets cost the same as before.
4. Raise the API's frame limit from 3 to 4 (`reviewRequestSchema`).

**How we'll check it.** Unit tests: no reps; one rep; two reps; three clean reps (no extra frame);
a short-range middle rep; a rushed middle rep; both on different reps (range wins). Typecheck, lint,
full suite, coverage stays above 80%.

**Result.** Done.
- `src/lib/analysis/keyframes.ts` with 12 unit tests covering every case in the plan; the form
  check flow now imports it; the API accepts up to 4 frames; the review instructions say "up to
  four still frames".
- Cost of the extra frame: ~1,100 input tokens, about $0.0008 now, only on sets with a bad middle rep.
- Not checked end to end with a filmed set; the selection logic is covered by unit tests and the
  request shape by the schema.
