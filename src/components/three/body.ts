import { Euler, Matrix4, Quaternion } from "three";
import type { LegDims, Pose } from "@/lib/exercise/pose";

/**
 * Contract between the demonstrator (frame loop, equipment) and a body (procedural or anatomical).
 * All bodies share the same kinematics; only their measurements differ.
 */
export interface BodyMetrics extends LegDims {
  /** Height of the hip joint above the seat surface when sitting. */
  seatOffset: number;
  /** Distance from the spine pivot to the surface of the back (negative z, in torso space). */
  backZ: number;
  hipHalfWidth: number;
  /** Where the hand holds a handle, relative to the hand joint in the aligned hand frame (left side). */
  gripOffset: readonly [number, number, number];
}

export type BodyJoint =
  | "pelvis"
  | "torso"
  | "thigh_L"
  | "thigh_R"
  | "shin_L"
  | "shin_R"
  | "foot_L"
  | "foot_R"
  | "hand_L"
  | "hand_R";

export interface BodyHandle {
  metrics: BodyMetrics;
  /** Poses the body with its hip joint centre at (0, pelvisY, pelvisZ) in the body's parent space. */
  apply: (pose: Pose, pelvisY: number, pelvisZ: number, progress: number) => void;
  /** World matrix of a joint with figure-aligned axes (x left, y up, z forward when standing at rest). */
  frame: (joint: BodyJoint, target: Matrix4) => boolean;
}

export const PROCEDURAL_METRICS: BodyMetrics = {
  thigh: 0.45,
  shin: 0.45,
  ankleHeight: 0.07,
  seatOffset: 0.06,
  backZ: -0.1,
  hipHalfWidth: 0.1,
  gripOffset: [0, -0.03, 0],
};

const rad = (deg: number) => (deg * Math.PI) / 180;

export type Side = 1 | -1;

export interface AlignedRotations {
  hips: Quaternion;
  spine: Quaternion;
  upperArm: Record<Side, Quaternion>;
  forearm: Record<Side, Quaternion>;
  thigh: Record<Side, Quaternion>;
  shin: Record<Side, Quaternion>;
  foot: Record<Side, Quaternion>;
}

const fromEuler = (x: number, y: number, z: number, order: "XYZ" | "ZXY" | "XZY" = "XYZ") =>
  new Quaternion().setFromEuler(new Euler(x, y, z, order));

/**
 * Cumulative joint orientations in the figure frame. Left side is +x, the figure faces +z.
 * Each value is the orientation of that segment relative to its rest orientation.
 */
export function alignedRotations(pose: Pose, footOnPlate: boolean): AlignedRotations {
  const hips = fromEuler(rad(pose.rootPitch), 0, 0);
  const spine = hips.clone().multiply(fromEuler(rad(pose.torsoPitch), 0, 0));
  const flatFoot = -(rad(pose.rootPitch) - rad(pose.hipFlex) + rad(pose.kneeFlex));

  const out: AlignedRotations = {
    hips,
    spine,
    upperArm: {} as Record<Side, Quaternion>,
    forearm: {} as Record<Side, Quaternion>,
    thigh: {} as Record<Side, Quaternion>,
    shin: {} as Record<Side, Quaternion>,
    foot: {} as Record<Side, Quaternion>,
  };
  for (const s of [1, -1] as const) {
    const upperArm = spine
      .clone()
      .multiply(fromEuler(-rad(pose.shoulderFlex), s * rad(pose.shoulderTwist), s * rad(pose.shoulderAbd), "ZXY"));
    const forearm = upperArm.clone().multiply(fromEuler(-rad(pose.elbowFlex), 0, 0));
    const thigh = hips.clone().multiply(fromEuler(-rad(pose.hipFlex), 0, s * rad(pose.hipAbd), "XZY"));
    const shin = thigh.clone().multiply(fromEuler(rad(pose.kneeFlex), 0, 0));
    const foot = shin.clone().multiply(fromEuler(footOnPlate ? 0 : flatFoot, 0, 0));
    out.upperArm[s] = upperArm;
    out.forearm[s] = forearm;
    out.thigh[s] = thigh;
    out.shin[s] = shin;
    out.foot[s] = foot;
  }
  return out;
}
