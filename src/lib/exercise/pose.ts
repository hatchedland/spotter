/**
 * Joint-angle pose model for the 3D demonstrator.
 * All angles are in degrees, measured from the relaxed standing position
 * (arms hanging, legs straight). The figure faces +z, y is up.
 */
export interface Pose {
  /** Whole-body tilt around the hips. Positive tips forward, negative reclines. */
  rootPitch: number;
  /** Torso lean relative to the pelvis. Positive leans forward. */
  torsoPitch: number;
  /** Arm raise in front of the body. */
  shoulderFlex: number;
  /** Arm raise out to the side. */
  shoulderAbd: number;
  /** Rotation of the upper arm around its own axis. Positive turns the forearm up when the arm is out to the side. */
  shoulderTwist: number;
  elbowFlex: number;
  /** Thigh raise in front of the body. */
  hipFlex: number;
  /** Thigh moved out to the side. */
  hipAbd: number;
  kneeFlex: number;
}

export const NEUTRAL_POSE: Pose = {
  rootPitch: 0,
  torsoPitch: 0,
  shoulderFlex: 0,
  shoulderAbd: 0,
  shoulderTwist: 0,
  elbowFlex: 0,
  hipFlex: 0,
  hipAbd: 0,
  kneeFlex: 0,
};

export function definePose(partial: Partial<Pose>): Pose {
  return { ...NEUTRAL_POSE, ...partial };
}

const POSE_KEYS = Object.keys(NEUTRAL_POSE) as (keyof Pose)[];

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const clamped = Math.min(1, Math.max(0, t));
  const out = { ...a };
  for (const key of POSE_KEYS) {
    out[key] = a[key] + (b[key] - a[key]) * clamped;
  }
  return out;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** Segment lengths of the demonstrator in metres. */
export const BODY = {
  thigh: 0.45,
  shin: 0.45,
  ankleHeight: 0.07,
  hipHalfWidth: 0.1,
  torso: 0.5,
  torsoBase: 0.06,
  shoulderHalfWidth: 0.19,
  upperArm: 0.3,
  forearm: 0.27,
  headRadius: 0.1,
} as const;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Leg measurements needed to keep a figure's feet planted. */
export interface LegDims {
  thigh: number;
  shin: number;
  ankleHeight: number;
}

/**
 * Pelvis position that keeps both feet planted at the origin for a standing pose.
 * Returns [y, z] for the pelvis (hip joint centre).
 */
export function groundedPelvis(pose: Pose, dims: LegDims = BODY): [number, number] {
  const h = toRad(pose.hipFlex);
  const shinAngle = toRad(pose.hipFlex - pose.kneeFlex);
  const y = dims.thigh * Math.cos(h) + dims.shin * Math.cos(shinAngle) + dims.ankleHeight;
  const z = -(dims.thigh * Math.sin(h) + dims.shin * Math.sin(shinAngle));
  return [y, z];
}

export type RepPhase = "lift" | "hold" | "lower" | "rest";

export interface Tempo {
  /** Seconds for the working (lifting) part of the rep. */
  lift: number;
  /** Pause at the hardest point. */
  hold: number;
  /** Seconds for the controlled return. */
  lower: number;
  /** Pause at the start position. */
  rest: number;
}

export function tempoDuration(tempo: Tempo): number {
  return tempo.lift + tempo.hold + tempo.lower + tempo.rest;
}

/**
 * Where in the rep cycle we are at `seconds`.
 * `progress` is 0 at the start position and 1 at the end position.
 */
export function sampleRep(
  tempo: Tempo,
  seconds: number,
): { phase: RepPhase; progress: number; phaseProgress: number } {
  const total = tempoDuration(tempo);
  if (total <= 0) return { phase: "rest", progress: 0, phaseProgress: 0 };
  let t = ((seconds % total) + total) % total;

  if (t < tempo.lift) {
    const p = t / tempo.lift;
    return { phase: "lift", progress: easeInOutSine(p), phaseProgress: p };
  }
  t -= tempo.lift;
  if (t < tempo.hold) return { phase: "hold", progress: 1, phaseProgress: t / tempo.hold };
  t -= tempo.hold;
  if (t < tempo.lower) {
    const p = t / tempo.lower;
    return { phase: "lower", progress: 1 - easeInOutSine(p), phaseProgress: p };
  }
  t -= tempo.lower;
  return { phase: "rest", progress: 0, phaseProgress: tempo.rest > 0 ? t / tempo.rest : 1 };
}
