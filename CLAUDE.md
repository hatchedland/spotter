@AGENTS.md

# Spotter: project rules

These override the global Codebase Standards where they conflict.

## Git

- Remote: https://github.com/hatchedland/spotter (account `hatchedland`).
- **This project has no JIRA tickets. Never use a `GPT-<id>` scope or ask for one.**
- Branches: `main` = production, `dev` = integration. Branch from `dev` as `<type>/<short-kebab-slug>`
  (e.g. `feature/scan-flow`, `fix/replay-mirroring`). `hotfix/*` branches from `main`.
- Commits: `<gitmoji> <description>`, subject line only, actual unicode emoji, one concern per commit.
  Example: `✨ Add form-check rep detection`.
- Never add `Co-Authored-By` lines. Never open a PR unless explicitly asked in that message.

## Docs first

- Every development is written up in `docs/` **before** it is built: problem, plan, how it will be
  checked. Then build, then add the result to the doc. See `docs/README.md` for the format.
- Changes to an existing feature go in that feature's doc as a dated entry, not a new file.
- **Before every push to GitHub**, bring `docs/` and this `CLAUDE.md` up to date with what is being
  pushed: fill in each entry's **Result**, update file tables, build steps, open questions and the
  `docs/README.md` index, and change any rule here that the work has made stale. Commit those
  updates in the same push, never in a later one.

## Code

- Next.js 16 App Router + `cacheComponents`. Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- AI calls go to Google Gemini directly via `@ai-sdk/google` with AI SDK 7 (`instructions`, `Output.object`,
  `{ type: "file" }` image parts). Key from `GOOGLE_GENERATIVE_AI_API_KEY`, never `NEXT_PUBLIC_`, real
  values only in `.env.local`. See `docs/ai-provider.md`.
  Model id from `VISION_MODEL`, server-only code in `src/server/`.
- API routes live under `/api/v1/`, validate input with Zod (`src/lib/schemas.ts`) and return
  `{ error, code }` with a real HTTP status on failure. Routes that call the AI model check
  `rateLimit()` (`src/server/rate-limit.ts`) before reading the body.
- Pure logic (`src/lib/exercise`, `src/lib/analysis`, `src/lib/rate-limit.ts`) is unit-tested with Vitest; keep coverage ≥ 80%.
  Run `npm run typecheck && npm run lint && npm test` before committing.
- No `any`. Hooks before conditional returns. Ref-holding props end in `Ref` (React Compiler lint).

## Design system

- Tokens live in `src/app/globals.css` (`:root` + dark mode) and are exposed as Tailwind theme colours.
  Components use semantic tokens (`bg-surface`, `text-steel`, `bg-plate`), never raw hex.
- Type: Barlow Condensed for display (`font-display`), Barlow for body. Scale: `text-h1/h2/h3/body/small`.
- Plate blue (`--plate`) is the only accent. It marks primary actions and primary muscles.
- 3D scene colours are read from the `--scene-*` tokens via `useSceneColors`.
- The 3D figure is an écorché built from Z-Anatomy by `tools/anatomy/build_figure.py` into
  `public/models/ecorche.glb`. Rebuild and verification steps are in `docs/anatomy-figure.md`.
- Every animation respects `prefers-reduced-motion` and has a visible pause control.
- Touch targets are at least 44px. Every state (empty, loading, error, success) has written copy.
