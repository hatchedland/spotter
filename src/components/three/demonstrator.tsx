"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { muscleRole, type Muscle, type MuscleRole, type MuscleTargets } from "@/lib/exercise/muscles";
import type { SceneProps } from "@/lib/exercise/patterns";
import { BODY, groundedPelvis, lerpPose, sampleRep, type Pose, type RepPhase, type Tempo } from "@/lib/exercise/pose";
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

const rad = (deg: number) => (deg * Math.PI) / 180;
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

type Side = 1 | -1;
const SIDES: readonly Side[] = [1, -1];

type JointRef = RefObject<Group | null>;

export function Demonstrator({ motion, muscles, colors, controlRef, onPhaseChange }: DemonstratorProps) {
  const stageRef = useRef<Group>(null);
  const rootRef = useRef<Group>(null);
  const torsoRef = useRef<Group>(null);
  const barRef = useRef<Mesh>(null);
  const cableARef = useRef<Mesh>(null);
  const cableBRef = useRef<Mesh>(null);
  const lShoulderRef = useRef<Group>(null);
  const lElbowRef = useRef<Group>(null);
  const lHandRef = useRef<Group>(null);
  const lHipRef = useRef<Group>(null);
  const lKneeRef = useRef<Group>(null);
  const lAnkleRef = useRef<Group>(null);
  const rShoulderRef = useRef<Group>(null);
  const rElbowRef = useRef<Group>(null);
  const rHandRef = useRef<Group>(null);
  const rHipRef = useRef<Group>(null);
  const rKneeRef = useRef<Group>(null);
  const rAnkleRef = useRef<Group>(null);
  const clockRef = useRef(0);
  const lastPhaseRef = useRef<RepPhase | null>(null);
  const glowMaterialsRef = useRef(new Set<MeshStandardMaterial>());

  const { scene } = motion;
  const footOnPlate = scene.legPad === "footplate";
  const scratch = useMemo(() => ({ a: new Vector3(), b: new Vector3(), mid: new Vector3() }), []);

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

    const pose = lerpPose(motion.start, motion.end, progress);
    const root = rootRef.current;
    const torso = torsoRef.current;
    if (!root || !torso) return;

    if (motion.grounded || !scene.seat) {
      const [y, z] = groundedPelvis(pose);
      root.position.set(0, y, z);
    } else {
      root.position.set(0, scene.seat.height + 0.06, 0);
    }
    root.rotation.x = rad(pose.rootPitch);
    torso.rotation.x = rad(pose.torsoPitch);

    const sides: readonly [Side, JointRef, JointRef, JointRef, JointRef, JointRef][] = [
      [1, lShoulderRef, lElbowRef, lHipRef, lKneeRef, lAnkleRef],
      [-1, rShoulderRef, rElbowRef, rHipRef, rKneeRef, rAnkleRef],
    ];
    const flatFoot = -(rad(pose.rootPitch) - rad(pose.hipFlex) + rad(pose.kneeFlex));
    for (const [s, shoulder, elbow, hip, knee, ankle] of sides) {
      shoulder.current?.rotation.set(-rad(pose.shoulderFlex), s * rad(pose.shoulderTwist), s * rad(pose.shoulderAbd), "ZXY");
      elbow.current?.rotation.set(-rad(pose.elbowFlex), 0, 0);
      hip.current?.rotation.set(-rad(pose.hipFlex), 0, s * rad(pose.hipAbd), "XZY");
      knee.current?.rotation.set(rad(pose.kneeFlex), 0, 0);
      ankle.current?.rotation.set(footOnPlate ? 0 : flatFoot, 0, 0);
    }

    // Working muscles glow harder the further into the rep they are.
    for (const material of glowMaterialsRef.current) material.emissiveIntensity = 0.15 + 0.55 * progress;

    // Bar and cables follow the hands.
    const stage = stageRef.current;
    const hl = lHandRef.current;
    const hr = rHandRef.current;
    if (!stage || !hl || !hr) return;
    const a = stage.worldToLocal(hl.getWorldPosition(scratch.a));
    const b = stage.worldToLocal(hr.getWorldPosition(scratch.b));
    scratch.mid.copy(a).add(b).multiplyScalar(0.5);

    if (barRef.current) placeBetween(barRef.current, a, b, scene.rails ? 0.55 : 0.2);
    if (scene.cable.length === 1 && cableARef.current) {
      placeBetween(cableARef.current, scratch.mid, new Vector3(...scene.cable[0]));
    } else if (scene.cable.length === 2 && cableARef.current && cableBRef.current) {
      placeBetween(cableARef.current, a, new Vector3(...scene.cable[0]));
      placeBetween(cableBRef.current, b, new Vector3(...scene.cable[1]));
    }
  });

  const registerGlow = useCallback((material: MeshStandardMaterial | null) => {
    if (!material) return;
    const set = glowMaterialsRef.current;
    set.add(material);
    return () => {
      set.delete(material);
    };
  }, []);

  const muscle = (name: Muscle, position: [number, number, number], scale: [number, number, number], key?: string) => (
    <MuscleMesh
      key={key ?? name}
      role={muscleRole(muscles, name)}
      colors={colors}
      position={position}
      scale={scale}
      registerGlow={registerGlow}
    />
  );

  const bodyMat = <meshStandardMaterial color={colors.body} roughness={0.75} />;
  const metalMat = <meshStandardMaterial color={colors.metal} roughness={0.35} metalness={0.6} />;
  const padMat = <meshStandardMaterial color={colors.pad} roughness={0.9} />;

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

      {/* Pelvis */}
      <group ref={rootRef}>
        <mesh scale={[1.25, 0.8, 0.85]} castShadow>
          <sphereGeometry args={[0.13, 24, 16]} />
          {bodyMat}
        </mesh>
        {SIDES.map((s) => muscle("glutes", [s * 0.065, -0.03, -0.075], [0.07, 0.075, 0.05], `glutes${s}`))}
        {SIDES.map((s) => muscle("abductors", [s * 0.145, -0.02, 0], [0.03, 0.07, 0.06], `abductors${s}`))}

        {scene.seat ? (
          <mesh position={[0, -0.1, 0.1]} receiveShadow>
            <boxGeometry args={[0.44, 0.07, 0.5]} />
            {padMat}
          </mesh>
        ) : null}

        {/* Torso */}
        <group ref={torsoRef} position={[0, BODY.torsoBase, 0]}>
          <mesh position={[0, 0.25, 0]} scale={[1.3, 1, 0.78]} castShadow>
            <capsuleGeometry args={[0.13, 0.26, 8, 20]} />
            {bodyMat}
          </mesh>
          {SIDES.map((s) => muscle("chest", [s * 0.08, 0.38, 0.085], [0.085, 0.065, 0.04], `chest${s}`))}
          {muscle("abs", [0, 0.19, 0.088], [0.075, 0.12, 0.03])}
          {SIDES.map((s) => muscle("obliques", [s * 0.13, 0.17, 0.045], [0.035, 0.1, 0.055], `obliques${s}`))}
          {SIDES.map((s) => muscle("lats", [s * 0.12, 0.29, -0.055], [0.055, 0.13, 0.06], `lats${s}`))}
          {muscle("upper_back", [0, 0.41, -0.085], [0.13, 0.08, 0.04])}
          {muscle("lower_back", [0, 0.12, -0.085], [0.065, 0.09, 0.03])}

          {scene.seat?.backrest ? (
            <mesh position={[0, 0.3, -0.17]} receiveShadow>
              <boxGeometry args={[0.44, 0.62, 0.07]} />
              {padMat}
            </mesh>
          ) : null}

          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.045, 0.05, 0.1, 12]} />
            {bodyMat}
          </mesh>
          <mesh position={[0, 0.66, 0.01]} castShadow>
            <sphereGeometry args={[BODY.headRadius, 24, 16]} />
            {bodyMat}
          </mesh>

          <Arm side={1} shoulderRef={lShoulderRef} elbowRef={lElbowRef} handRef={lHandRef} bodyMat={bodyMat} metalMat={metalMat} grip={scene.grip} muscle={muscle} />
          <Arm side={-1} shoulderRef={rShoulderRef} elbowRef={rElbowRef} handRef={rHandRef} bodyMat={bodyMat} metalMat={metalMat} grip={scene.grip} muscle={muscle} />
        </group>

        <Leg side={1} hipRef={lHipRef} kneeRef={lKneeRef} ankleRef={lAnkleRef} bodyMat={bodyMat} padMat={padMat} legPad={scene.legPad} muscle={muscle} />
        <Leg side={-1} hipRef={rHipRef} kneeRef={rKneeRef} ankleRef={rAnkleRef} bodyMat={bodyMat} padMat={padMat} legPad={scene.legPad} muscle={muscle} />
      </group>
    </group>
  );
}

type MuscleFactory = (
  name: Muscle,
  position: [number, number, number],
  scale: [number, number, number],
  key?: string,
) => ReactNode;

function Arm({
  shoulderRef,
  elbowRef,
  handRef,
  side,
  bodyMat,
  metalMat,
  grip,
  muscle,
}: {
  shoulderRef: JointRef;
  elbowRef: JointRef;
  handRef: JointRef;
  side: Side;
  bodyMat: ReactNode;
  metalMat: ReactNode;
  grip: SceneProps["grip"];
  muscle: MuscleFactory;
}) {
  return (
    <group ref={shoulderRef} position={[side * BODY.shoulderHalfWidth, 0.46, 0]}>
      <mesh position={[0, -BODY.upperArm / 2, 0]} castShadow>
        <capsuleGeometry args={[0.045, BODY.upperArm - 0.06, 6, 12]} />
        {bodyMat}
      </mesh>
      {muscle("front_delts", [0, -0.03, 0.04], [0.045, 0.06, 0.035], `fd${side}`)}
      {muscle("side_delts", [side * 0.035, -0.03, 0], [0.035, 0.065, 0.045], `sd${side}`)}
      {muscle("rear_delts", [0, -0.03, -0.04], [0.045, 0.06, 0.035], `rd${side}`)}
      {muscle("biceps", [0, -0.16, 0.03], [0.036, 0.09, 0.032], `bi${side}`)}
      {muscle("triceps", [0, -0.15, -0.03], [0.038, 0.1, 0.034], `tri${side}`)}

      <group ref={elbowRef} position={[0, -BODY.upperArm, 0]}>
        <mesh position={[0, -BODY.forearm / 2, 0]} castShadow>
          <capsuleGeometry args={[0.036, BODY.forearm - 0.05, 6, 12]} />
          {bodyMat}
        </mesh>
        {muscle("forearms", [0, -0.09, 0], [0.042, 0.085, 0.042], `fa${side}`)}
        <group ref={handRef} position={[0, -BODY.forearm - 0.03, 0]}>
          <mesh scale={[0.8, 1, 0.6]}>
            <sphereGeometry args={[0.045, 12, 10]} />
            {bodyMat}
          </mesh>
          {grip === "handles" ? (
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.016, 0.016, 0.13, 10]} />
              {metalMat}
            </mesh>
          ) : null}
        </group>
      </group>
    </group>
  );
}

function Leg({
  hipRef,
  kneeRef,
  ankleRef,
  side,
  bodyMat,
  padMat,
  legPad,
  muscle,
}: {
  hipRef: JointRef;
  kneeRef: JointRef;
  ankleRef: JointRef;
  side: Side;
  bodyMat: ReactNode;
  padMat: ReactNode;
  legPad: SceneProps["legPad"];
  muscle: MuscleFactory;
}) {
  return (
    <group ref={hipRef} position={[side * BODY.hipHalfWidth, 0, 0]}>
      <mesh position={[0, -BODY.thigh / 2, 0]} castShadow>
        <capsuleGeometry args={[0.07, BODY.thigh - 0.1, 6, 14]} />
        {bodyMat}
      </mesh>
      {muscle("quads", [0, -0.21, 0.04], [0.06, 0.17, 0.045], `q${side}`)}
      {muscle("hamstrings", [0, -0.21, -0.04], [0.058, 0.16, 0.045], `h${side}`)}
      {muscle("adductors", [-side * 0.045, -0.13, 0], [0.035, 0.12, 0.05], `ad${side}`)}

      {legPad === "knees_outside" || legPad === "knees_inside" ? (
        <mesh position={[(legPad === "knees_outside" ? side : -side) * 0.1, -0.38, 0]}>
          <boxGeometry args={[0.04, 0.16, 0.14]} />
          {padMat}
        </mesh>
      ) : null}

      <group ref={kneeRef} position={[0, -BODY.thigh, 0]}>
        <mesh position={[0, -BODY.shin / 2, 0]} castShadow>
          <capsuleGeometry args={[0.05, BODY.shin - 0.08, 6, 12]} />
          {bodyMat}
        </mesh>
        {muscle("calves", [0, -0.13, -0.035], [0.045, 0.1, 0.04], `c${side}`)}

        {legPad === "shin_front" || legPad === "shin_back" ? (
          <mesh position={[0, -0.37, legPad === "shin_front" ? 0.08 : -0.08]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.045, 0.045, 0.16, 16]} />
            {padMat}
          </mesh>
        ) : null}

        <group ref={ankleRef} position={[0, -BODY.shin, 0]}>
          <mesh position={[0, -0.035, 0.05]} castShadow>
            <boxGeometry args={[0.085, 0.055, 0.22]} />
            {bodyMat}
          </mesh>
          {legPad === "footplate" && side === 1 ? (
            <mesh position={[-BODY.hipHalfWidth, -0.075, 0.05]} receiveShadow>
              <boxGeometry args={[0.6, 0.025, 0.4]} />
              {padMat}
            </mesh>
          ) : null}
        </group>
      </group>
    </group>
  );
}

function MuscleMesh({
  role,
  colors,
  position,
  scale,
  registerGlow,
}: {
  role: MuscleRole;
  colors: SceneColors;
  position: [number, number, number];
  scale: [number, number, number];
  registerGlow: (material: MeshStandardMaterial | null) => (() => void) | undefined;
}) {
  const color = role === "primary" ? colors.primary : role === "secondary" ? colors.secondary : colors.muscleIdle;
  return (
    <mesh position={position} scale={scale}>
      <sphereGeometry args={[1, 20, 14]} />
      <meshStandardMaterial
        ref={role === "primary" ? registerGlow : undefined}
        color={color}
        emissive={role === "primary" ? colors.primary : "#000000"}
        emissiveIntensity={role === "primary" ? 0.3 : 0}
        roughness={0.55}
      />
    </mesh>
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
