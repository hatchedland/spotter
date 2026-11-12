# AI provider

Spotter uses a vision model for two things: identifying a machine from a photo
(`POST /api/v1/machines/identify`) and reviewing a filmed set (`POST /api/v1/form-reviews`).
Both live in `src/server/ai.ts` and use AI SDK 7 (`generateText` with `Output.object`).

## Pieces

| Path | Role |
| --- | --- |
| `src/server/ai.ts` | Model calls, instructions, error mapping (`AiFailure`) |
| `src/app/api/v1/machines/identify/route.ts` | Photo → machine identification |
| `src/app/api/v1/form-reviews/route.ts` | Set metrics + frames → form review |
| `.env.local` (not committed) | `GOOGLE_GENERATIVE_AI_API_KEY`, optional `VISION_MODEL` |

## Keeping the key private

- `src/server/ai.ts` imports `server-only`; the build fails if browser code imports it.
- Only the API routes call the model. The browser never sees the key, only the results.
- The key's name has no `NEXT_PUBLIC_` prefix, so Next.js never sends it to the browser.
  Never add that prefix.
- Locally the key lives in `.env.local` (gitignored). Deployed, it goes in the host's environment
  variables. Never put a real key in `.env.example`; the repo is public.
- Open risk: the two routes have no auth or rate limit, so anyone can run up the Google bill.

## Cost

Measured 2026-11-12 with real calls to `gemini-3.8-flash` using the app's instructions and image
sizes. Prices are third-party listings of the standard tier (Google's own pricing page could not be
opened): $0.75 per million input tokens, $3.75 per million output tokens, **doubling on
2027-01-01**. Gemini bills its thinking tokens as output.

| Call | Input tokens | Output tokens (incl. thinking) | Cost now | From 2027-01-01 |
| --- | --- | --- | --- | --- |
| Identify a machine (1 photo) | ~1,500 | ~400 (300 thinking) | ~$0.003 | ~$0.005 |
| Form review (3 frames) | ~4,400 | ~3,500 (3,000 thinking) | ~$0.016 | ~$0.032 |
| Form review (4 frames) | ~5,500 | ~3,500 | ~$0.017 | ~$0.034 |

- Every image costs ~1,088 input tokens whatever its pixel size (a 640 px frame costs the same as
  a 1280 px photo), so shrinking images does not save money; the request's media resolution setting
  would.
- Thinking is ~85% of a review's cost. Lowering the thinking level is the biggest available saving,
  to be weighed against review quality.
- Worst case per IP under the rate limits: 10 reviews + 20 identifies per hour, about $0.23/hour
  now.

### 2026-11-12: Call Google Gemini directly instead of Vercel AI Gateway

**Problem.** Calls go through Vercel AI Gateway, which needs gateway credentials
(`AI_GATEWAY_API_KEY` or `vercel env pull`). We have a Google Gemini API key and want the app to use
it directly, with no Vercel dependency for AI.

**Plan.**
1. Add `@ai-sdk/google` (4.0.118, built against the same provider packages as `ai` 7.0.170).
2. In `src/server/ai.ts`, create the model with `google(VISION_MODEL)`. The provider reads
   `GOOGLE_GENERATIVE_AI_API_KEY` from the environment. Default `VISION_MODEL` becomes
   `gemini-3.8-flash` (bare Gemini model id, no `provider/` prefix).
3. Rename the local variable in `.env.local` to `GOOGLE_GENERATIVE_AI_API_KEY`.
4. `.env.example`: replace the gateway entry with an empty `GOOGLE_GENERATIVE_AI_API_KEY=` and the
   new `VISION_MODEL` default.
5. `CLAUDE.md`: remove the Vercel AI Gateway rule; state that AI calls go to Google Gemini directly
   via `@ai-sdk/google`, server-only, key from `GOOGLE_GENERATIVE_AI_API_KEY`.
6. README: update the setup steps if they mention the gateway.

**How we'll check it.**
- `npm run typecheck && npm run lint && npm test`.
- Call `POST /api/v1/machines/identify` on the local dev server with a real photo and confirm a
  schema-valid identification comes back from `gemini-3.8-flash`.
- Confirm the key does not appear in any client bundle (`grep` the `.next/static` output).

**Result.** Done.
- `src/server/ai.ts` calls `google(VISION_MODEL)`, default `gemini-3.8-flash`. The Vercel AI Gateway
  rule is gone from `CLAUDE.md`; `.env.example` and the README describe the Google key instead.
- End to end: `POST /api/v1/machines/identify` with a lat pulldown image returned HTTP 200 in 5.4 s,
  schema-valid, `pattern: "lat_pulldown"`, confidence high, correct primary and secondary muscles.
- `next build` succeeds. The key and its variable name appear nowhere in `.next/static`, and the key
  appears nowhere in the build output at all: it is read from the environment at runtime.
- Gemini 2.5 models refuse this key ("no longer available to new users"); 3.8 Flash works. The
  key's Vertex AI endpoint is blocked; we use the Gemini API endpoint, which works.
- Typecheck, lint and 40 tests pass.
- Not covered: `POST /api/v1/form-reviews` was not called end to end (needs recorded set metrics);
  it uses the same model and code path.

### 2026-11-12: Rate-limit the AI routes

**Problem.** Both AI routes are public with no auth. Anyone can script requests and run up the
Google bill; that is a bigger cost risk than the per-call price.

**Plan.**
1. A pure sliding-window limiter in `src/lib/rate-limit.ts` (injectable clock, unit-tested): each
   key keeps the timestamps of its recent requests; a request is allowed if fewer than `limit` fall
   inside the window, otherwise it is refused with the seconds until the oldest one expires.
   Stale keys are pruned so memory stays bounded.
2. `src/server/rate-limit.ts` keys requests by client IP (first `x-forwarded-for` entry, then
   `x-real-ip`; unknown clients share one bucket) and holds one limiter per route.
3. Limits per IP:
   - `POST /api/v1/machines/identify`: 20 per hour
   - `POST /api/v1/form-reviews`: 10 per hour

   Checked before the body is parsed, so refused requests cost nothing.
4. Refusals return HTTP 429 with `{ error, code: "RATE_LIMITED" }` and a `Retry-After` header. The
   message tells the user how many minutes to wait; the client already shows server error text.

**Known limit.** The counts live in memory per server instance, so they reset on a cold start and
are not shared across instances. This stops casual abuse and runaway scripts, not a determined
attacker rotating IPs. The upgrade path is a shared store (e.g. Redis) behind the same interface,
plus a spending cap on the Google key itself.

**How we'll check it.** Unit tests: allows up to the limit; refuses the next with the right
retry-after; allows again once the window slides; keys are independent; pruning. On the dev server:
exceed the identify limit with cheap invalid requests and confirm 429, `RATE_LIMITED` and
`Retry-After`, then confirm valid requests still work after the window.

**Result.** Done.
- `src/lib/rate-limit.ts` (7 unit tests), `src/server/rate-limit.ts`, wired into both routes before
  body parsing. New error code `RATE_LIMITED`.
- Dev server: 20 identify requests passed, the 21st returned 429 with
  `{"error":"You've reached the limit for now. Try again in 60 minutes.","code":"RATE_LIMITED"}`
  and `Retry-After: 3600`.
- Not checked live: requests passing again after the hour (covered by the window-slide unit test).
