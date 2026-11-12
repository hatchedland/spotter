import { getPattern, type PatternId } from "@/lib/exercise/patterns";
import type { FormFlag, RepMetric, SetMetrics } from "@/lib/schemas";
import { torsoLean } from "./geometry";
import { detectReps, median, robustRange } from "./reps";
import { measureSignal, smooth, type PoseFrame } from "./signals";

const MIN_DETECTION_RATE = 0.6;
const MIN_LOWER_SEC = 1;
const MAX_SIDE_DIFF_DEG = 15;

function tolerance(unit: SetMetrics["signalUnit"]) {
  return unit === "deg" ? 15 : 0.4;
}

export function analyseSet(
  patternId: PatternId,
  frames: readonly PoseFrame[],
  aspectRatio: number,
): SetMetrics {
  const pattern = getPattern(patternId);
  const { analysis } = pattern;
  const unit: SetMetrics["signalUnit"] = analysis.signal === "wrist_gap" ? "ratio" : "deg";

  const samples = frames.map((f) => measureSignal(f, analysis.signal));
  const measured = samples.filter((s) => Number.isFinite(s.value)).length;
  const detectionRate = frames.length ? measured / frames.length : 0;

  const times = samples.map((s) => s.t);
  const values = measured ? smooth(samples.map((s) => s.value)) : [];
  const minRange = unit === "deg" ? 20 : 0.5;
  const reps = measured ? detectReps(times, values, analysis.liftDirection, minRange) : [];

  const leans = frames.map((f) => (f.image ? torsoLean(f.image, aspectRatio) : Number.NaN));
  const torsoSwingDeg = robustRange(leans);

  const diffs = samples.map((s) => Math.abs(s.sideDiff)).filter(Number.isFinite);
  const sideDifference = diffs.length ? median(diffs) : 0;

  const metrics: Omit<SetMetrics, "flags"> = {
    pattern: patternId,
    durationSec: frames.length ? frames[frames.length - 1].t - frames[0].t : 0,
    framesAnalysed: frames.length,
    detectionRate,
    signal: analysis.signal,
    signalUnit: unit,
    targetStart: analysis.start,
    targetEnd: analysis.end,
    reps,
    torsoSwingDeg,
    sideDifference,
  };
  return { ...metrics, flags: deriveFlags(metrics, analysis.liftDirection, analysis.maxTorsoSwing) };
}

export function deriveFlags(
  m: Omit<SetMetrics, "flags">,
  liftDirection: "increase" | "decrease",
  maxTorsoSwing: number,
): FormFlag[] {
  const flags: FormFlag[] = [];
  if (m.detectionRate < MIN_DETECTION_RATE) flags.push("low_visibility");
  if (m.reps.length === 0) {
    flags.push("no_reps");
    return flags;
  }

  const tol = tolerance(m.signalUnit);
  const startMedian = median(m.reps.map((r) => r.startValue));
  const peakMedian = median(m.reps.map((r) => r.peakValue));
  const rises = liftDirection === "increase";

  if (rises ? startMedian > m.targetStart + tol : startMedian < m.targetStart - tol) flags.push("short_range_start");
  if (rises ? peakMedian < m.targetEnd - tol : peakMedian > m.targetEnd + tol) flags.push("short_range_end");
  if (median(m.reps.map((r) => r.lowerSec)) < MIN_LOWER_SEC) flags.push("fast_lowering");
  if (m.torsoSwingDeg > maxTorsoSwing) flags.push("torso_swing");
  if (m.signalUnit === "deg" && m.sideDifference > MAX_SIDE_DIFF_DEG) flags.push("uneven_sides");
  if (isInconsistent(m.reps)) flags.push("inconsistent_reps");
  return flags;
}

function isInconsistent(reps: readonly RepMetric[]): boolean {
  if (reps.length < 3) return false;
  const ranges = reps.map((r) => Math.abs(r.peakValue - r.startValue));
  const mean = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  if (mean === 0) return false;
  const sd = Math.sqrt(ranges.reduce((a, r) => a + (r - mean) ** 2, 0) / ranges.length);
  return sd / mean > 0.2;
}

/** Plain-language fallback copy for each automatic flag, used when AI coaching is unavailable. */
export const FLAG_COPY: Record<FormFlag, { title: string; how: string }> = {
  no_reps: {
    title: "No full reps found",
    how: "Film the whole set from the side, with every joint of the working limb in frame.",
  },
  low_visibility: {
    title: "Your body was hard to see",
    how: "Prop your phone at hip height 2–3 m away, in good light, with your whole body in frame.",
  },
  short_range_start: {
    title: "Go all the way back to the start",
    how: "Finish every return in the full stretch position before starting the next rep.",
  },
  short_range_end: {
    title: "Finish each rep fully",
    how: "Lighten the weight until you can reach the end position on every rep.",
  },
  fast_lowering: {
    title: "Slow down the return",
    how: "Count two seconds on the way back on every rep.",
  },
  torso_swing: {
    title: "Keep your body still",
    how: "Lock your torso in place and lower the weight until only the working joint moves.",
  },
  uneven_sides: {
    title: "One side is working harder",
    how: "Move both arms or legs at the same speed and to the same point.",
  },
  inconsistent_reps: {
    title: "Reps are changing as you tire",
    how: "Stop the set when you can no longer match the range of your first rep.",
  },
};
