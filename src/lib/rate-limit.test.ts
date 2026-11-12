import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

function limiter(limit = 3, windowMs = 60_000) {
  let t = 1_000_000;
  const rl = new RateLimiter({ limit, windowMs, now: () => t });
  return { rl, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  it("allows requests up to the limit and counts down what remains", () => {
    const { rl } = limiter();
    expect(rl.check("a")).toEqual({ allowed: true, remaining: 2 });
    expect(rl.check("a")).toEqual({ allowed: true, remaining: 1 });
    expect(rl.check("a")).toEqual({ allowed: true, remaining: 0 });
  });

  it("refuses the next request with the seconds until the oldest expires", () => {
    const { rl, advance } = limiter();
    rl.check("a");
    advance(10_000);
    rl.check("a");
    rl.check("a");
    expect(rl.check("a")).toEqual({ allowed: false, retryAfterSec: 50 });
  });

  it("does not record refused requests, so retrying doesn't extend the wait", () => {
    const { rl, advance } = limiter(1);
    rl.check("a");
    advance(30_000);
    rl.check("a");
    advance(30_000);
    expect(rl.check("a").allowed).toBe(true);
  });

  it("allows again once the window slides past old requests", () => {
    const { rl, advance } = limiter(2);
    rl.check("a");
    advance(20_000);
    rl.check("a");
    expect(rl.check("a").allowed).toBe(false);
    advance(40_000);
    expect(rl.check("a")).toEqual({ allowed: true, remaining: 0 });
  });

  it("keeps keys independent", () => {
    const { rl } = limiter(1);
    rl.check("a");
    expect(rl.check("a").allowed).toBe(false);
    expect(rl.check("b").allowed).toBe(true);
  });

  it("never reports less than one second to wait", () => {
    const { rl, advance } = limiter(1, 1_000);
    rl.check("a");
    advance(999);
    expect(rl.check("a")).toEqual({ allowed: false, retryAfterSec: 1 });
  });

  it("prunes keys whose requests have all expired", () => {
    const { rl, advance } = limiter(5, 1_000);
    rl.check("a");
    rl.check("b");
    expect(rl.size).toBe(2);
    advance(1_500);
    rl.check("c");
    expect(rl.size).toBe(1);
  });
});
