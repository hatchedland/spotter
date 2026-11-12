import type { TrackedSignal } from "@/lib/exercise/patterns";
import { distance, jointAngle, LM, vectorAngle, type ImagePoint, type Point3 } from "./geometry";

export interface PoseFrame {
  /** Seconds from the start of the clip. */
  t: number;
  /** Metric 3D landmarks centred on the hips, or null when no person was found. */
  world: readonly Point3[] | null;
  /** Normalised image landmarks with visibility, or null when no person was found. */
  image: readonly ImagePoint[] | null;
}

export interface SignalSample {
  t: number;
  /** Value of the tracked signal, or NaN when it could not be measured. */
  value: number;
  /** Left minus right, for sided angle signals; NaN otherwise. */
  sideDiff: number;
}

const VISIBLE = 0.5;

type Side = "left" | "right";

const CHAINS: Partial<Record<TrackedSignal, Record<Side, [number, number, number]>>> = {
  elbow: {
    left: [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
    right: [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  },
  knee: {
    left: [LM.leftHip, LM.leftKnee, LM.leftAnkle],
    right: [LM.rightHip, LM.rightKnee, LM.rightAnkle],
  },
  hip: {
    left: [LM.leftShoulder, LM.leftHip, LM.leftKnee],
    right: [LM.rightShoulder, LM.rightHip, LM.rightKnee],
  },
  shoulder: {
    left: [LM.leftHip, LM.leftShoulder, LM.leftElbow],
    right: [LM.rightHip, LM.rightShoulder, LM.rightElbow],
  },
};

function chainVisibility(image: readonly ImagePoint[], chain: readonly number[]): number {
  return Math.min(...chain.map((i) => image[i]?.visibility ?? 0));
}

function allVisible(image: readonly ImagePoint[], indices: readonly number[]): boolean {
  return indices.every((i) => (image[i]?.visibility ?? 0) >= VISIBLE);
}

export function measureSignal(frame: PoseFrame, signal: TrackedSignal): SignalSample {
  const empty: SignalSample = { t: frame.t, value: Number.NaN, sideDiff: Number.NaN };
  const { world, image } = frame;
  if (!world || !image) return empty;

  const chains = CHAINS[signal];
  if (chains) {
    const angles: Partial<Record<Side, number>> = {};
    const visibility: Record<Side, number> = { left: 0, right: 0 };
    for (const side of ["left", "right"] as const) {
      const [a, b, c] = chains[side];
      visibility[side] = chainVisibility(image, chains[side]);
      if (visibility[side] >= VISIBLE) angles[side] = jointAngle(world[a], world[b], world[c]);
    }
    const best: Side = visibility.left >= visibility.right ? "left" : "right";
    const value = angles[best] ?? Number.NaN;
    const sideDiff =
      angles.left !== undefined && angles.right !== undefined ? angles.left - angles.right : Number.NaN;
    return { t: frame.t, value, sideDiff };
  }

  if (signal === "thigh_spread") {
    const needed = [LM.leftHip, LM.leftKnee, LM.rightHip, LM.rightKnee];
    if (!allVisible(image, needed)) return empty;
    const left = { x: world[LM.leftKnee].x - world[LM.leftHip].x, y: world[LM.leftKnee].y - world[LM.leftHip].y, z: world[LM.leftKnee].z - world[LM.leftHip].z };
    const right = { x: world[LM.rightKnee].x - world[LM.rightHip].x, y: world[LM.rightKnee].y - world[LM.rightHip].y, z: world[LM.rightKnee].z - world[LM.rightHip].z };
    return { t: frame.t, value: vectorAngle(left, right), sideDiff: Number.NaN };
  }

  // wrist_gap
  const needed = [LM.leftWrist, LM.rightWrist, LM.leftShoulder, LM.rightShoulder];
  if (!allVisible(image, needed)) return empty;
  const shoulderWidth = distance(world[LM.leftShoulder], world[LM.rightShoulder]);
  if (shoulderWidth === 0) return empty;
  return {
    t: frame.t,
    value: distance(world[LM.leftWrist], world[LM.rightWrist]) / shoulderWidth,
    sideDiff: Number.NaN,
  };
}

/** Fills gaps by linear interpolation, then applies a centred moving average. */
export function smooth(values: readonly number[], window = 5): number[] {
  const filled = [...values];
  const known = filled.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
  if (known.length === 0) return filled;

  for (let i = 0; i < filled.length; i++) {
    if (Number.isFinite(filled[i])) continue;
    const prev = [...known].reverse().find((k) => k < i);
    const next = known.find((k) => k > i);
    if (prev === undefined && next !== undefined) filled[i] = filled[next];
    else if (next === undefined && prev !== undefined) filled[i] = filled[prev];
    else if (prev !== undefined && next !== undefined) {
      const ratio = (i - prev) / (next - prev);
      filled[i] = filled[prev] + (filled[next] - filled[prev]) * ratio;
    }
  }

  const half = Math.floor(window / 2);
  return filled.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(filled.length, i + half + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += filled[j];
    return sum / (to - from);
  });
}

/** Landmark indices involved in a signal, for highlighting in replays and snapshots. */
export function signalLandmarks(signal: TrackedSignal): number[] {
  const chains = CHAINS[signal];
  if (chains) return [...chains.left, ...chains.right];
  if (signal === "thigh_spread") return [LM.leftHip, LM.leftKnee, LM.rightHip, LM.rightKnee];
  return [LM.leftShoulder, LM.leftElbow, LM.leftWrist, LM.rightShoulder, LM.rightElbow, LM.rightWrist];
}
