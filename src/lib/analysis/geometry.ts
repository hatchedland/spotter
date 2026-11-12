export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface ImagePoint extends Point3 {
  visibility: number;
}

/** MediaPipe Pose landmark indices used by the analysis. */
export const LM = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const sub = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Point3) => Math.sqrt(dot(a, a));

export function distance(a: Point3, b: Point3): number {
  return length(sub(a, b));
}

/** Angle between two vectors in degrees (0–180). Returns NaN for zero-length vectors. */
export function vectorAngle(u: Point3, v: Point3): number {
  const denom = length(u) * length(v);
  if (denom === 0) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, dot(u, v) / denom));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Interior angle at joint `b` formed by a–b–c, in degrees. 180 means fully straight. */
export function jointAngle(a: Point3, b: Point3, c: Point3): number {
  return vectorAngle(sub(a, b), sub(c, b));
}

export function midpoint(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/**
 * Lean of the torso from vertical in the camera image, in degrees.
 * Uses normalised image coordinates (y grows downward), corrected for the frame's aspect ratio.
 */
export function torsoLean(image: readonly ImagePoint[], aspectRatio: number): number {
  const shoulders = midpoint(image[LM.leftShoulder], image[LM.rightShoulder]);
  const hips = midpoint(image[LM.leftHip], image[LM.rightHip]);
  const dx = (shoulders.x - hips.x) * aspectRatio;
  const dy = hips.y - shoulders.y;
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}
