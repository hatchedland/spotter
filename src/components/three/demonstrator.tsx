"use client";

import { useFrame } from "@react-three/fiber";
import { Component, Suspense, useImperativeHandle, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Group, Matrix4, Mesh, Quaternion, Vector3 } from "three";
import type { MuscleTargets } from "@/lib/exercise/muscles";
import type { SceneProps } from "@/lib/exercise/patterns";
import { groundedPelvis, lerpPose, sampleRep, type Pose, type RepPhase, type Tempo } from "@/lib/exercise/pose";
import { AnatomyBody } from "./anatomy-body";
import type { BodyHandle, BodyJoint, Side } from "./body";
import { ProceduralBody } from "./procedural-body";
import type { SceneColors } from "./use-scene-colors";

export interface PlaybackControl {
  playing: boolean;
  /** 0–1 position in the rep, used while paused. */
  scrub: number;
}

export interface DemonstratorMotion {
  start: Pose;
  end: Pose;
  tempo: Tempo;
  grounded: boolean;
  scene: SceneProps;
}

interface DemonstratorProps {
  motion: DemonstratorMotion;
  muscles: MuscleTargets;
  colors: SceneColors;
  controlRef: RefObject<PlaybackControl>;
  onPhaseChange?: (phase: RepPhase) => void;
}

const UP = new Vector3(0, 1, 0);

/** Stretches a unit-height cylinder mesh between two points. */
function placeBetween(mesh: Mesh, a: Vector3, b: Vector3, extend = 0) {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  if (len === 0) return;
  dir.normalize();
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir));
  mesh.scale.set(1, len + extend * 2, 1);
}

/** Renders the procedural figure if the anatomy model fails to load. */
class BodyFallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const HAND: Record<Side, BodyJoint> = { 1: "hand_L", [-1]: "hand_R" };

interface PadsHandle {
  /** Re-pins every pad to its joint. `toStage` maps world space into the stage group. */
  update: (body: BodyHandle, toStage: Matrix4) => void;
}

export function Demonstrator({ motion, muscles, colors, controlRef, onPhaseChange }: DemonstratorProps) {
  const stageRef = useRef<Group>(null);
  const bodyRef = useRef<BodyHandle | null>(null);
  const barRef = useRef<Mesh>(null);
  const cableARef = useRef<Mesh>(null);
  const cableBRef = useRef<Mesh>(null);
  const padsRef = useRef<PadsHandle | null>(null);
  const clockRef = useRef(0);
  const lastPhaseRef = useRef<RepPhase | null>(null);

  const { scene } = motion;
  const footOnPlate = scene.legPad === "footplate";
  const scratch = useMemo(
    () => ({ a: new Vector3(), b: new Vector3(), mid: new Vector3(), m: new Matrix4(), inv: new Matrix4() }),
    [],
  );

  useFrame((_, delta) => {
    const ctl = controlRef.current;
    if (ctl.playing) clockRef.current += Math.min(delta, 0.1);

    const sample = sampleRep(motion.tempo, clockRef.current);
    const progress = ctl.playing ? sample.progress : ctl.scrub;
    if (ctl.playing && sample.phase !== lastPhaseRef.current) {
      lastPhaseRef.current = sample.phase;
      onPhaseChange?.(sample.phase);
    }
    if (!ctl.playing) {
      // Keep the clock aligned with the scrubber so playback resumes from here.
      clockRef.current = progress * motion.tempo.lift;
      lastPhaseRef.current = null;
    }

    const body = bodyRef.current;
    const stage = stageRef.current;
    if (!body || !stage) return;
    const m = body.metrics;
    const pose = lerpPose(motion.start, motion.end, progress);

    if (motion.grounded || !scene.seat) {
      const [y, z] = groundedPelvis(pose, m);
      body.apply(pose, y, z, progress);
    } else {
      body.apply(pose, scene.seat.height + m.seatOffset, 0, progress);
    }

    stage.updateWorldMatrix(true, false);
    scratch.inv.copy(stage.matrixWorld).invert();
    padsRef.current?.update(body, scratch.inv);

    // Bar and cables follow the grip points.
    const grip = (s: Side, target: Vector3) => {
      if (!body.frame(HAND[s], scratch.m)) return target.set(0, 0, 0);
      scratch.m.premultiply(scratch.inv);
      return target.set(s * m.gripOffset[0], m.gripOffset[1], m.gripOffset[2]).applyMatrix4(scratch.m);
    };
    const a = grip(1, scratch.a);
    const b = grip(-1, scratch.b);
    scratch.mid.copy(a).add(b).multiplyScalar(0.5);

    if (barRef.current) placeBetween(barRef.current, a, b, scene.rails ? 0.55 : 0.2);
    if (scene.cable.length === 1 && cableARef.current) {
      placeBetween(cableARef.current, scratch.mid, new Vector3(...scene.cable[0]));
    } else if (scene.cable.length === 2 && cableARef.current && cableBRef.current) {
      placeBetween(cableARef.current, a, new Vector3(...scene.cable[0]));
      placeBetween(cableBRef.current, b, new Vector3(...scene.cable[1]));
    }
  });

  const metalMat = <meshStandardMaterial color={colors.metal} roughness={0.35} metalness={0.6} />;
  const padMat = <meshStandardMaterial color={colors.pad} roughness={0.9} />;
  const procedural = <ProceduralBody bodyRef={bodyRef} muscles={muscles} colors={colors} footOnPlate={footOnPlate} />;

  return (
    <group ref={stageRef}>
      <Equipment scene={scene} metalMat={metalMat} padMat={padMat} />

      {scene.grip === "bar" ? (
        <mesh ref={barRef} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 1, 12]} />
          {metalMat}
        </mesh>
      ) : null}
      {scene.cable.length > 0 ? (
        <mesh ref={cableARef}>
          <cylinderGeometry args={[0.004, 0.004, 1, 6]} />
          {metalMat}
        </mesh>
      ) : null}
      {scene.cable.length > 1 ? (
        <mesh ref={cableBRef}>
          <cylinderGeometry args={[0.004, 0.004, 1, 6]} />
          {metalMat}
        </mesh>
      ) : null}

      <BodyFallback fallback={procedural}>
        <Suspense fallback={procedural}>
          <AnatomyBody bodyRef={bodyRef} muscles={muscles} colors={colors} footOnPlate={footOnPlate} />
        </Suspense>
      </BodyFallback>

      <Pads scene={scene} padsRef={padsRef} metalMat={metalMat} padMat={padMat} />
    </group>
  );
}

type PadJoint = "pelvis" | "torso" | "foot_L" | "thigh_L" | "thigh_R" | "shin_L" | "shin_R" | "hand_L" | "hand_R";

/**
 * Seat, backrest, leg pads, footplate and handles. Each sits in a group whose matrix is set every
 * frame from the joint it rests against; the pad is offset within that frame by the body's measurements.
 */
function Pads({
  scene,
  padsRef,
  metalMat,
  padMat,
}: {
  scene: SceneProps;
  padsRef: RefObject<PadsHandle | null>;
  metalMat: ReactNode;
  padMat: ReactNode;
}) {
  const groups = useMemo(() => new Map<PadJoint, Group>(), []);
  const frame = useMemo(() => new Matrix4(), []);
  const offset = useMemo(() => new Matrix4(), []);

  useImperativeHandle(
    padsRef,
    (): PadsHandle => ({
      update(body, toStage) {
        const m = body.metrics;
        const offsets: Record<PadJoint, [number, number, number]> = {
          pelvis: [0, -m.seatOffset - 0.035, 0.1],
          torso: [0, 0.3, m.backZ - 0.04],
          foot_L: [-m.hipHalfWidth, -m.ankleHeight - 0.005, 0.05],
          thigh_L: [(scene.legPad === "knees_outside" ? 1 : -1) * 0.1, -m.thigh * 0.84, 0],
          thigh_R: [(scene.legPad === "knees_outside" ? -1 : 1) * 0.1, -m.thigh * 0.84, 0],
          shin_L: [0, -m.shin * 0.82, scene.legPad === "shin_front" ? 0.08 : -0.08],
          shin_R: [0, -m.shin * 0.82, scene.legPad === "shin_front" ? 0.08 : -0.08],
          hand_L: [m.gripOffset[0], m.gripOffset[1], m.gripOffset[2]],
          hand_R: [-m.gripOffset[0], m.gripOffset[1], m.gripOffset[2]],
        };
        for (const [joint, group] of groups) {
          if (!body.frame(joint, frame)) continue;
          group.matrix.multiplyMatrices(toStage, frame).multiply(offset.makeTranslation(...offsets[joint]));
          group.matrixWorldNeedsUpdate = true;
        }
      },
    }),
    [scene.legPad, groups, frame, offset],
  );

  const pin = (joint: PadJoint, mesh: ReactNode) => (
    <group
      key={joint}
      matrixAutoUpdate={false}
      ref={(g) => {
        if (!g) return;
        groups.set(joint, g);
        return () => void groups.delete(joint);
      }}
    >
      {mesh}
    </group>
  );

  const kneePads = scene.legPad === "knees_outside" || scene.legPad === "knees_inside";
  const shinPads = scene.legPad === "shin_front" || scene.legPad === "shin_back";

  return (
    <>
      {scene.seat
        ? pin(
            "pelvis",
            <mesh receiveShadow>
              <boxGeometry args={[0.44, 0.07, 0.5]} />
              {padMat}
            </mesh>,
          )
        : null}
      {scene.seat?.backrest
        ? pin(
            "torso",
            <mesh receiveShadow>
              <boxGeometry args={[0.44, 0.62, 0.07]} />
              {padMat}
            </mesh>,
          )
        : null}
      {scene.legPad === "footplate"
        ? pin(
            "foot_L",
            <mesh receiveShadow>
              <boxGeometry args={[0.6, 0.025, 0.4]} />
              {padMat}
            </mesh>,
          )
        : null}
      {kneePads
        ? (["thigh_L", "thigh_R"] as const).map((joint) =>
            pin(
              joint,
              <mesh>
                <boxGeometry args={[0.04, 0.16, 0.14]} />
                {padMat}
              </mesh>,
            ),
          )
        : null}
      {shinPads
        ? (["shin_L", "shin_R"] as const).map((joint) =>
            pin(
              joint,
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.045, 0.045, 0.16, 16]} />
                {padMat}
              </mesh>,
            ),
          )
        : null}
      {scene.grip === "handles"
        ? (["hand_L", "hand_R"] as const).map((joint) =>
            pin(
              joint,
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.016, 0.016, 0.13, 10]} />
                {metalMat}
              </mesh>,
            ),
          )
        : null}
    </>
  );
}

/** Machine frame: towers, pulleys, weight stacks, seat posts and guide rails. */
function Equipment({ scene, metalMat, padMat }: { scene: SceneProps; metalMat: ReactNode; padMat: ReactNode }) {
  return (
    <group>
      {scene.seat ? (
        <mesh position={[0, scene.seat.height / 2, 0.05]}>
          <cylinderGeometry args={[0.035, 0.05, scene.seat.height, 12]} />
          {metalMat}
        </mesh>
      ) : null}

      {scene.cable.map(([x, y, z], i) => {
        // Tower sits just beyond the pulley, away from the lifter.
        const horizontal = Math.hypot(x, z) || 1;
        const dx = x === 0 && z === 0 ? 0 : (x / horizontal) * 0.25;
        const dz = x === 0 && z === 0 ? 0.25 : (z / horizontal) * 0.25;
        const tx = x + dx;
        const tz = z + dz;
        return (
          <group key={i}>
            <mesh position={[tx, (y + 0.15) / 2, tz]} castShadow>
              <boxGeometry args={[0.07, y + 0.15, 0.07]} />
              {metalMat}
            </mesh>
            <mesh position={[tx, 0.35, tz]} castShadow>
              <boxGeometry args={[0.22, 0.55, 0.14]} />
              {padMat}
            </mesh>
            <mesh position={[(x + tx) / 2, y + 0.04, (z + tz) / 2]}>
              <boxGeometry args={[Math.abs(dx) + 0.05, 0.04, Math.abs(dz) + 0.05]} />
              {metalMat}
            </mesh>
            <mesh position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 0.025, 16]} />
              {metalMat}
            </mesh>
          </group>
        );
      })}

      {scene.rails
        ? [1, -1].map((s) => (
            <mesh key={s} position={[s * 0.8, 1.1, 0]} castShadow>
              <cylinderGeometry args={[0.02, 0.02, 2.2, 10]} />
              {metalMat}
            </mesh>
          ))
        : null}
    </group>
  );
}
