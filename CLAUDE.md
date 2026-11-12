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

## Code

- Next.js 16 App Router + `cacheComponents`. Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- AI calls go through Vercel AI Gateway with AI SDK 7 (`instructions`, `Output.object`, `{ type: "file" }` image parts).
  Model id from `VISION_MODEL`, server-only code in `src/server/`.
- API routes live under `/api/v1/`, validate input with Zod (`src/lib/schemas.ts`) and return
  `{ error, code }` with a real HTTP status on failure.
- Pure logic (`src/lib/exercise`, `src/lib/analysis`) is unit-tested with Vitest; keep coverage ≥ 80%.
  Run `npm run typecheck && npm run lint && npm test` before committing.
- No `any`. Hooks before conditional returns. Ref-holding props end in `Ref` (React Compiler lint).

## Design system

- Tokens live in `src/app/globals.css` (`:root` + dark mode) and are exposed as Tailwind theme colours.
  Components use semantic tokens (`bg-surface`, `text-steel`, `bg-plate`), never raw hex.
- Type: Barlow Condensed for display (`font-display`), Barlow for body. Scale: `text-h1/h2/h3/body/small`.
- Plate blue (`--plate`) is the only accent. It marks primary actions and primary muscles.
- 3D scene colours are read from the `--scene-*` tokens via `useSceneColors`.
- Every animation respects `prefers-reduced-motion` and has a visible pause control.
- Touch targets are at least 44px. Every state (empty, loading, error, success) has written copy.
