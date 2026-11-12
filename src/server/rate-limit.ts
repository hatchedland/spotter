import "server-only";
import { RateLimiter } from "@/lib/rate-limit";
import { jsonError } from "./http";

const HOUR_MS = 60 * 60 * 1000;

/** Per-IP limits on the routes that call the paid AI model. */
const limiters = {
  identify: new RateLimiter({ limit: 20, windowMs: HOUR_MS }),
  review: new RateLimiter({ limit: 10, windowMs: HOUR_MS }),
} as const;

export type LimitedRoute = keyof typeof limiters;

/** Client IP from the proxy headers. Unknown clients share one bucket rather than going unlimited. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Returns a 429 response if this client is over the route's limit, otherwise null.
 * Call before parsing the body so refused requests cost nothing.
 */
export function rateLimit(route: LimitedRoute, request: Request): Response | null {
  const decision = limiters[route].check(clientKey(request));
  if (decision.allowed) return null;
  const minutes = Math.ceil(decision.retryAfterSec / 60);
  const response = jsonError(
    429,
    "RATE_LIMITED",
    `You've reached the limit for now. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  );
  response.headers.set("Retry-After", String(decision.retryAfterSec));
  return response;
}
