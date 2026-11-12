import type { RepMetric } from "@/lib/schemas";

/**
 * Finds reps in a smoothed signal.
 * `liftDirection` says whether the signal rises or falls during the lifting part.
 * A rep is: start position → furthest point → back to the start zone.
 * Hysteresis at 30% / 70% of the observed range ignores small wobbles.
 */
export function detectReps(
  times: readonly number[],
  values: readonly number[],
  liftDirection: "increase" | "decrease",
  minRange: number,
): RepMetric[] {
  if (times.length !== values.length || values.length < 3) return [];

  const s = liftDirection === "increase" ? [...values] : values.map((v) => -v);
  const min = Math.min(...s);
  const max = Math.max(...s);
  if (max - min < minRange) return [];

  const low = min + 0.3 * (max - min);
  const high = min + 0.7 * (max - min);

  const reps: RepMetric[] = [];
  let state: "waiting" | "low" | "high" = s[0] <= low ? "low" : "waiting";
  let segmentStart = 0;
  let peak = 0;

  const argmin = (from: number, to: number) => {
    let best = from;
    for (let i = from; i <= to; i++) if (s[i] < s[best]) best = i;
    return best;
  };

  for (let i = 0; i < s.length; i++) {
    if (state === "waiting") {
      if (s[i] <= low) {
        state = "low";
        segmentStart = i;
      }
      continue;
    }

    if (state === "low" && s[i] >= high) {
      state = "high";
      peak = i;
      continue;
    }

    if (state === "high") {
      if (s[i] > s[peak]) peak = i;
      if (s[i] <= low) {
        // Walk on to the bottom of this return before closing the rep.
        let end = i;
        while (end + 1 < s.length && s[end + 1] < s[end]) end++;
        const start = argmin(segmentStart, peak);
        reps.push({
          index: reps.length,
          startSec: times[start],
          peakSec: times[peak],
          endSec: times[end],
          liftSec: times[peak] - times[start],
          lowerSec: times[end] - times[peak],
          startValue: values[start],
          peakValue: values[peak],
        });
        state = "low";
        segmentStart = end;
        i = end;
      }
    }
  }
  return reps;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Spread between the 5th and 95th percentile, robust to single-frame tracking glitches. */
export function robustRange(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length < 2) return 0;
  const at = (p: number) => finite[Math.min(finite.length - 1, Math.max(0, Math.round(p * (finite.length - 1))))];
  return at(0.95) - at(0.05);
}
