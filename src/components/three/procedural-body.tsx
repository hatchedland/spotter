"use client";

import { useCallback, useImperativeHandle, useRef, type ReactNode, type RefObject } from "react";
import { Group, Matrix4, MeshStandardMaterial } from "three";
import { muscleRole, type Muscle, type MuscleRole, type MuscleTargets } from "@/lib/exercise/muscles";
import { BODY, type Pose } from "@/lib/exercise/pose";
import { PROCEDURAL_METRICS, type BodyHandle, type BodyJoint, type Side } from "./body";
import type { SceneColors } from "./use-scene-colors";

const rad = (deg: number) => (deg * Math.PI) / 180;
const SIDES: readonly Side[] = [1, -1];

type JointRef = RefObject<Group | null>;
type MuscleFactory = (
  name: Muscle,
  position: [number, number, number],
  scale: [number, number, number],
  key?: string,
) => ReactNode;

/**
 * Low-detail mannequin made of primitives. Shown instantly while the anatomy model loads,
 * and used as the fallback if it cannot load.
 */
export function ProceduralBody({
  bodyRef,
  muscles,
  colors,
  footOnPlate,
}: {
  bodyRef: RefObject<BodyHandle | null>;
  muscles: MuscleTargets;
  colors: SceneColors;
  footOnPlate: boolean;
}) {
  const rootRef = useRef<Group>(null);
  const torsoRef = useRef<Group>(null);
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
  const glowMaterialsRef = useRef(new Set<MeshStandardMaterial>());

  useImperativeHandle(
    bodyRef,
    (): BodyHandle => {
      const joints: Record<BodyJoint, JointRef> = {
        pelvis: rootRef,
        torso: torsoRef,
        thigh_L: lHipRef,
        thigh_R: rHipRef,
        shin_L: lKneeRef,
        shin_R: rKneeRef,
        foot_L: lAnkleRef,
        foot_R: rAnkleRef,
        hand_L: lHandRef,
        hand_R: rHandRef,
      };
      return {
        metrics: PROCEDURAL_METRICS,
        apply(pose: Pose, pelvisY: number, pelvisZ: number, progress: number) {
          const root = rootRef.current;
          const torso = torsoRef.current;
          if (!root || !torso) return;
          root.position.set(0, pelvisY, pelvisZ);
          root.rotation.x = rad(pose.rootPitch);
          torso.rotation.x = rad(pose.torsoPitch);
          const flatFoot = -(rad(pose.rootPitch) - rad(pose.hipFlex) + rad(pose.kneeFlex));
          const sides: readonly [Side, JointRef, JointRef, JointRef, JointRef, JointRef][] = [
            [1, lShoulderRef, lElbowRef, lHipRef, lKneeRef, lAnkleRef],
            [-1, rShoulderRef, rElbowRef, rHipRef, rKneeRef, rAnkleRef],
          ];
          for (const [s, shoulder, elbow, hip, knee, ankle] of sides) {
            shoulder.current?.rotation.set(-rad(pose.shoulderFlex), s * rad(pose.shoulderTwist), s * rad(pose.shoulderAbd), "ZXY");
            elbow.current?.rotation.set(-rad(pose.elbowFlex), 0, 0);
            hip.current?.rotation.set(-rad(pose.hipFlex), 0, s * rad(pose.hipAbd), "XZY");
            knee.current?.rotation.set(rad(pose.kneeFlex), 0, 0);
            ankle.current?.rotation.set(footOnPlate ? 0 : flatFoot, 0, 0);
          }
          for (const material of glowMaterialsRef.current) material.emissiveIntensity = 0.15 + 0.55 * progress;
        },
        frame(joint: BodyJoint, target: Matrix4) {
          const obj = joints[joint].current;
          if (!obj) return false;
          obj.updateWorldMatrix(true, false);
          target.copy(obj.matrixWorld);
          return true;
        },
      };
    },
    [footOnPlate],
  );

  const registerGlow = useCallback((material: MeshStandardMaterial | null) => {
    if (!material) return;
    const set = glowMaterialsRef.current;
    set.add(material);
    return () => {
      set.delete(material);
    };
  }, []);

  const muscle: MuscleFactory = (name, position, scale, key) => (
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

  return (
    <group ref={rootRef}>
      <mesh scale={[1.25, 0.8, 0.85]} castShadow>
        <sphereGeometry args={[0.13, 24, 16]} />
        {bodyMat}
      </mesh>
      {SIDES.map((s) => muscle("glutes", [s * 0.065, -0.03, -0.075], [0.07, 0.075, 0.05], `glutes${s}`))}
      {SIDES.map((s) => muscle("abductors", [s * 0.145, -0.02, 0], [0.03, 0.07, 0.06], `abductors${s}`))}

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
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.045, 0.05, 0.1, 12]} />
          {bodyMat}
        </mesh>
        <mesh position={[0, 0.66, 0.01]} castShadow>
          <sphereGeometry args={[BODY.headRadius, 24, 16]} />
          {bodyMat}
        </mesh>
        <Arm side={1} shoulderRef={lShoulderRef} elbowRef={lElbowRef} handRef={lHandRef} bodyMat={bodyMat} muscle={muscle} />
        <Arm side={-1} shoulderRef={rShoulderRef} elbowRef={rElbowRef} handRef={rHandRef} bodyMat={bodyMat} muscle={muscle} />
      </group>

      <Leg side={1} hipRef={lHipRef} kneeRef={lKneeRef} ankleRef={lAnkleRef} bodyMat={bodyMat} muscle={muscle} />
      <Leg side={-1} hipRef={rHipRef} kneeRef={rKneeRef} ankleRef={rAnkleRef} bodyMat={bodyMat} muscle={muscle} />
    </group>
  );
}

function Arm({
  shoulderRef,
  elbowRef,
  handRef,
  side,
  bodyMat,
  muscle,
}: {
  shoulderRef: JointRef;
  elbowRef: JointRef;
  handRef: JointRef;
  side: Side;
  bodyMat: ReactNode;
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
        <group ref={handRef} position={[0, -BODY.forearm, 0]}>
          <mesh position={[0, -0.03, 0]} scale={[0.8, 1, 0.6]}>
            <sphereGeometry args={[0.045, 12, 10]} />
            {bodyMat}
          </mesh>
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
  muscle,
}: {
  hipRef: JointRef;
  kneeRef: JointRef;
  ankleRef: JointRef;
  side: Side;
  bodyMat: ReactNode;
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
      <group ref={kneeRef} position={[0, -BODY.thigh, 0]}>
        <mesh position={[0, -BODY.shin / 2, 0]} castShadow>
          <capsuleGeometry args={[0.05, BODY.shin - 0.08, 6, 12]} />
          {bodyMat}
        </mesh>
        {muscle("calves", [0, -0.13, -0.035], [0.045, 0.1, 0.04], `c${side}`)}
        <group ref={ankleRef} position={[0, -BODY.shin, 0]}>
          <mesh position={[0, -0.035, 0.05]} castShadow>
            <boxGeometry args={[0.085, 0.055, 0.22]} />
            {bodyMat}
          </mesh>
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
