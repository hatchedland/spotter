import { describe, expect, it } from "vitest";
import type { RepMetric } from "@/lib/schemas";
import { pickKeyframes, rangeShortfall } from "./keyframes";

// Target: a full rep moves the signal from 170 to 70 (100 units).
const TARGET = { targetStart: 170, targetEnd: 70 };

function rep(index: number, overrides: Partial<RepMetric> = {}): RepMetric {
  const startSec = index * 3;
  return {
    index,
    startSec,
    peakSec: startSec + 1,
    endSec: startSec + 3,
    liftSec: 1,
    lowerSec: 2,
    startValue: 170,
    peakValue: 70,
    ...overrides,
  };
}

const metrics = (reps: RepMetric[]) => ({ reps, durationSec: reps.length * 3 + 1, ...TARGET });

describe("rangeShortfall", () => {
  it("is 0 for a full rep and grows as range shrinks", () => {
    expect(rangeShortfall(rep(0), 170, 70)).toBe(0);
    expect(rangeShortfall(rep(0, { peakValue: 120 }), 170, 70)).toBeCloseTo(0.5);
  });

  it("never goes negative for reps beyond the target", () => {
    expect(rangeShortfall(rep(0, { peakValue: 50 }), 170, 70)).toBe(0);
  });

  it("is 0 when the target range is empty", () => {
    expect(rangeShortfall(rep(0), 100, 100)).toBe(0);
  });
});

describe("pickKeyframes", () => {
  it("spreads three frames through the clip when no reps were found", () => {
    const frames = pickKeyframes({ reps: [], durationSec: 8, ...TARGET });
    expect(frames.map((f) => f.timeSec)).toEqual([2, 4, 6]);
  });

  it("shows start and end of a single rep", () => {
    const frames = pickKeyframes(metrics([rep(0)]));
    expect(frames.map((f) => f.label)).toEqual(["Start of rep 1", "End position of rep 1"]);
  });

  it("adds the last rep when there are two", () => {
    const frames = pickKeyframes(metrics([rep(0), rep(1)]));
    expect(frames).toHaveLength(3);
    expect(frames[2]).toEqual({ label: "End position of rep 2 (last rep)", timeSec: 4 });
  });

  it("adds nothing extra when the middle reps are clean", () => {
    expect(pickKeyframes(metrics([rep(0), rep(1), rep(2), rep(3)]))).toHaveLength(3);
  });

  it("adds the middle rep with the shortest range", () => {
    const frames = pickKeyframes(metrics([rep(0), rep(1, { peakValue: 85 }), rep(2, { peakValue: 110 }), rep(3)]));
    expect(frames).toHaveLength(4);
    expect(frames[3]).toEqual({ label: "End position of rep 3 (shortest range)", timeSec: 7 });
  });

  it("ignores a small range shortfall", () => {
    expect(pickKeyframes(metrics([rep(0), rep(1, { peakValue: 80 }), rep(2)]))).toHaveLength(3);
  });

  it("adds the middle rep that lowers fastest, mid-lowering", () => {
    const frames = pickKeyframes(metrics([rep(0), rep(1), rep(2, { lowerSec: 1, endSec: 8 }), rep(3)]));
    expect(frames).toHaveLength(4);
    expect(frames[3]).toEqual({ label: "Lowering of rep 3 (fastest lowering)", timeSec: 7.5 });
  });

  it("prefers a range problem over rushed lowering on another rep", () => {
    const frames = pickKeyframes(
      metrics([rep(0), rep(1, { lowerSec: 1 }), rep(2, { peakValue: 120 }), rep(3)]),
    );
    expect(frames[3].label).toBe("End position of rep 3 (shortest range)");
  });

  it("never picks the first or last rep as the extra frame", () => {
    const frames = pickKeyframes(metrics([rep(0, { peakValue: 150 }), rep(1), rep(2, { lowerSec: 0.5 })]));
    expect(frames).toHaveLength(3);
  });
});
