# Spotter

Photograph a gym machine to see a 3D demonstration, the muscles it works and how to set it up.
Film a set to get rep counts, range-of-motion measurements and specific form fixes.

## How it works

- **Scan**: `POST /api/v1/machines/identify` sends a downscaled photo to a vision model (Google Gemini),
  which maps it to one of the movement patterns in `src/lib/exercise/patterns.ts`.
- **Demonstrate**: a rigged 3D figure (`src/components/three`) animates the pattern's start and end poses
  at the coaching tempo, with primary and secondary muscles highlighted.
- **Form check**: MediaPipe Pose runs in the browser. `src/lib/analysis` turns landmarks into joint
  signals, detects reps and flags issues. Only three annotated stills and the numbers go to
  `POST /api/v1/form-reviews` for coaching. The video never leaves the device.

## Develop

```bash
npm install
cp -n .env.example .env.local   # then set GOOGLE_GENERATIVE_AI_API_KEY in .env.local
npm run dev
```

```bash
npm run typecheck && npm run lint && npm test   # npm run test:coverage for the 80% gate
```

## Attribution

Exercise logic and UI © the Spotter authors. Anatomy model assets (when added under `public/models/`)
are derived from Z-Anatomy and BodyParts3D and are licensed CC BY-SA 4.0. See `public/models/LICENSE.md`.
