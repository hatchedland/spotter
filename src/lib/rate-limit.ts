export type RateDecision = { allowed: true; remaining: number } | { allowed: false; retryAfterSec: number };

export interface RateLimiterOptions {
  /** Requests allowed per key inside one window. */
  limit: number;
  windowMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

/**
 * Sliding-window limiter: each key keeps the timestamps of its requests inside the window.
 * In-memory, so counts are per server instance and reset when it restarts.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private lastPrune = 0;

  constructor({ limit, windowMs, now = Date.now }: RateLimiterOptions) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Records the request if allowed. Refused requests are not recorded, so retrying doesn't extend the wait. */
  check(key: string): RateDecision {
    const now = this.now();
    this.pruneIfDue(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.limit - recent.length };
  }

  /** Number of keys currently tracked (for tests and monitoring). */
  get size(): number {
    return this.hits.size;
  }

  /** Drops keys with no requests inside the window, at most once per window, so memory stays bounded. */
  private pruneIfDue(now: number) {
    if (now - this.lastPrune < this.windowMs) return;
    this.lastPrune = now;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
