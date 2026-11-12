import type { RepMetric, SetMetrics } from "@/lib/schemas";
import { median } from "./reps";

export interface Keyframe {
  label: string;
  timeSec: number;
}

/** A middle rep is shown as an extra frame if it falls this far short of the target range… */
const RANGE_SHORTFALL_MIN = 0.15;
/** …or lowers in less than this share of the set's median lowering time. */
const RUSHED_LOWER_RATIO = 0.7;

type KeyframeInput = Pick<SetMetrics, "reps" | "durationSec" | "targetStart" | "targetEnd">;

/** How far a rep falls short of the full target range: 0 = full range, 1 = no movement. */
export function rangeShortfall(rep: RepMetric, targetStart: number, targetEnd: number): number {
  const target = Math.abs(targetEnd - targetStart);
  if (target === 0) return 0;
  return Math.max(0, 1 - Math.abs(rep.peakValue - rep.startValue) / target);
}

/**
 * Frames sent to the coach: the start and end of rep 1 and the end of the last rep, plus the
 * worst middle rep when one clearly stands out, so a bad rep mid-set is seen, not just measured.
 */
export function pickKeyframes(metrics: KeyframeInput): Keyframe[] {
  const { reps, durationSec, targetStart, targetEnd } = metrics;
  if (reps.length === 0) {
    return [0.25, 0.5, 0.75].map((f) => ({ label: `${Math.round(f * 100)}% through the clip`, timeSec: durationSec * f }));
  }

  const first = reps[0];
  const last = reps[reps.length - 1];
  const frames: Keyframe[] = [
    { label: "Start of rep 1", timeSec: first.startSec },
    { label: "End position of rep 1", timeSec: first.peakSec },
  ];
  if (reps.length > 1) frames.push({ label: `End position of rep ${last.index + 1} (last rep)`, timeSec: last.peakSec });

  const middle = reps.slice(1, -1);
  if (middle.length === 0) return frames;

  const shortest = middle.reduce((worst, r) =>
    rangeShortfall(r, targetStart, targetEnd) > rangeShortfall(worst, targetStart, targetEnd) ? r : worst,
  );
  if (rangeShortfall(shortest, targetStart, targetEnd) >= RANGE_SHORTFALL_MIN) {
    frames.push({ label: `End position of rep ${shortest.index + 1} (shortest range)`, timeSec: shortest.peakSec });
    return frames;
  }

  const medianLower = median(reps.map((r) => r.lowerSec));
  const fastest = middle.reduce((worst, r) => (r.lowerSec < worst.lowerSec ? r : worst));
  if (medianLower > 0 && fastest.lowerSec < medianLower * RUSHED_LOWER_RATIO) {
    frames.push({
      label: `Lowering of rep ${fastest.index + 1} (fastest lowering)`,
      timeSec: (fastest.peakSec + fastest.endSec) / 2,
    });
  }
  return frames;
}
