"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from "react";
import { Bone, Matrix4, Mesh, Object3D, Quaternion, SkinnedMesh, Vector3, type MeshStandardMaterial } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MUSCLES, muscleRole, type Muscle, type MuscleRole, type MuscleTargets } from "@/lib/exercise/muscles";
import type { Pose } from "@/lib/exercise/pose";
import { alignedRotations, type AlignedRotations, type BodyHandle, type BodyJoint, type BodyMetrics, type Side } from "./body";
import { createFibreMaterial } from "./fibre-material";
import type { SceneColors } from "./use-scene-colors";

/** Écorché figure built by tools/anatomy/build_figure.py from Z-Anatomy (CC BY-SA 4.0). */
export const ANATOMY_MODEL_URL = "/models/ecorche.glb";

type BoneName =
  | "hips" | "spine" | "chest" | "neck" | "head"
  | "upper_arm_L" | "forearm_L" | "hand_L" | "thigh_L" | "shin_L" | "foot_L"
  | "upper_arm_R" | "forearm_R" | "hand_R" | "thigh_R" | "shin_R" | "foot_R";

/** Bone, its parent, and which aligned rotation drives it. Ordered parents-first. */
const CHAIN: readonly [BoneName, BoneName | null, (a: AlignedRotations) => Quaternion][] = [
  ["hips", null, (a) => a.hips],
  ["spine", "hips", (a) => a.spine],
  ["chest", "spine", (a) => a.spine],
  ["neck", "chest", (a) => a.spine],
  ["head", "neck", (a) => a.spine],
  ...([1, -1] as const).flatMap((s): [BoneName, BoneName | null, (a: AlignedRotations) => Quaternion][] => {
    const x = s === 1 ? "L" : "R";
    return [
      [`upper_arm_${x}`, "chest", (a) => a.upperArm[s]],
      [`forearm_${x}`, `upper_arm_${x}`, (a) => a.forearm[s]],
      [`hand_${x}`, `forearm_${x}`, (a) => a.forearm[s]],
      [`thigh_${x}`, "hips", (a) => a.thigh[s]],
      [`shin_${x}`, `thigh_${x}`, (a) => a.shin[s]],
      [`foot_${x}`, `shin_${x}`, (a) => a.foot[s]],
    ];
  }),
];

const JOINT_BONES: Record<BodyJoint, [BoneName, (a: AlignedRotations) => Quaternion]> = {
  pelvis: ["hips", (a) => a.hips],
  torso: ["spine", (a) => a.spine],
  thigh_L: ["thigh_L", (a) => a.thigh[1]],
  thigh_R: ["thigh_R", (a) => a.thigh[-1]],
  shin_L: ["shin_L", (a) => a.shin[1]],
  shin_R: ["shin_R", (a) => a.shin[-1]],
  foot_L: ["foot_L", (a) => a.foot[1]],
  foot_R: ["foot_R", (a) => a.foot[-1]],
  hand_L: ["hand_L", (a) => a.forearm[1]],
  hand_R: ["hand_R", (a) => a.forearm[-1]],
};

interface Rig {
  root: Object3D;
  bones: Record<BoneName, Bone>;
  /** Rest orientation of each bone, in root space. */
  restQ: Record<BoneName, Quaternion>;
  /** Rest orientation of the hips' parent (the armature node), in root space. */
  armatureQ: Quaternion;
  hipsRest: Vector3;
  meshes: { mesh: SkinnedMesh | Mesh; groups: readonly Muscle[] | "tendon" | "other" }[];
  metrics: BodyMetrics;
}

function meshGroups(name: string): readonly Muscle[] | "tendon" | "other" {
  if (name.startsWith("tendon")) return "tendon";
  const match = /^muscle_(.+?)(_\d+)?$/.exec(name);
  if (!match || match[1] === "other") return "other";
  return match[1].split("+").filter((g): g is Muscle => (MUSCLES as readonly string[]).includes(g));
}

function buildRig(source: Object3D): Rig {
  const root = cloneSkinned(source);
  root.updateMatrixWorld(true);

  const bones = {} as Record<BoneName, Bone>;
  const restQ = {} as Record<BoneName, Quaternion>;
  for (const [name] of CHAIN) {
    const bone = root.getObjectByName(name);
    if (!(bone instanceof Bone)) throw new Error(`Anatomy model is missing bone "${name}".`);
    bones[name] = bone;
    restQ[name] = bone.getWorldQuaternion(new Quaternion());
  }
  const armatureQ = bones.hips.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();

  const pos = (b: BoneName) => bones[b].getWorldPosition(new Vector3());
  const hipsRest = pos("hips");

  const meshes: Rig["meshes"] = [];
  const boxes = new Map<string, { minY: number; minZ: number }>();
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false; // skinned bounds don't follow the pose
    const groups = meshGroups(obj.name);
    meshes.push({ mesh: obj, groups });
    // Measure the skinned rest shape: compressed models store quantized positions that only
    // land in figure space once the skin's bind matrices are applied.
    let box;
    if (obj instanceof SkinnedMesh) {
      obj.computeBoundingBox();
      box = obj.boundingBox?.clone().applyMatrix4(obj.matrixWorld);
    } else {
      obj.geometry.computeBoundingBox();
      box = obj.geometry.boundingBox?.clone().applyMatrix4(obj.matrixWorld);
    }
    if (box && Array.isArray(groups)) {
      for (const g of groups) boxes.set(g, { minY: box.min.y, minZ: box.min.z });
    }
  });

  const thigh = pos("thigh_L").distanceTo(pos("shin_L"));
  const shin = pos("shin_L").distanceTo(pos("foot_L"));
  const glutes = boxes.get("glutes");
  const back = [boxes.get("upper_back"), boxes.get("lower_back"), boxes.get("lats")].filter(Boolean);
  const hand = pos("hand_L");
  const along = hand.clone().sub(pos("forearm_L")).normalize().multiplyScalar(0.075);

  const metrics: BodyMetrics = {
    thigh,
    shin,
    ankleHeight: pos("foot_L").y,
    seatOffset: glutes ? hipsRest.y - glutes.minY : 0.09,
    backZ: back.length ? Math.min(...back.map((b) => b!.minZ)) - pos("spine").z : -0.12,
    hipHalfWidth: Math.abs(pos("thigh_L").x - hipsRest.x),
    gripOffset: [along.x, along.y, along.z],
  };

  return { root, bones, restQ, armatureQ, hipsRest, meshes, metrics };
}

// Matte, like dry tissue: low gloss and a faint fibre relief, so colour carries the form.
const MUSCLE_FINISH = { roughness: 0.82, fibreStrength: 0.22 };

/** Creates one material per role and assigns each mesh the strongest role among its muscle groups. */
function paintMuscles(rig: Rig, muscles: MuscleTargets, colors: SceneColors) {
  const materials: Record<MuscleRole | "tendon", MeshStandardMaterial> = {
    primary: createFibreMaterial({ color: colors.primary, emissive: colors.primary, ...MUSCLE_FINISH }),
    secondary: createFibreMaterial({ color: colors.secondary, ...MUSCLE_FINISH }),
    idle: createFibreMaterial({ color: colors.muscleIdle, roughness: 0.85, fibreStrength: 0.18 }),
    tendon: createFibreMaterial({ color: colors.tendon, roughness: 0.75, fibreStrength: 0.08 }),
  };
  const rank: Record<MuscleRole, number> = { primary: 2, secondary: 1, idle: 0 };
  for (const { mesh, groups } of rig.meshes) {
    if (groups === "tendon") mesh.material = materials.tendon;
    else if (groups === "other") mesh.material = materials.idle;
    else {
      const role = groups
        .map((g) => muscleRole(muscles, g))
        .reduce<MuscleRole>((best, r) => (rank[r] > rank[best] ? r : best), "idle");
      mesh.material = materials[role];
    }
  }
  return materials;
}

export function AnatomyBody({
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
  const { scene } = useGLTF(ANATOMY_MODEL_URL);
  const rig = useMemo(() => buildRig(scene), [scene]);
  const glowRef = useRef<MeshStandardMaterial[]>([]);
  const alignedRef = useRef<AlignedRotations | null>(null);

  // One material per role, shared across meshes.
  useEffect(() => {
    const materials = paintMuscles(rig, muscles, colors);
    glowRef.current = [materials.primary];
    return () => Object.values(materials).forEach((m) => m.dispose());
  }, [rig, muscles, colors]);

  useImperativeHandle(
    bodyRef,
    (): BodyHandle => {
      const parentWorld = new Quaternion();
      const worldQ = {} as Record<BoneName, Quaternion>;
      const scratchPos = new Vector3();
      const scratchQ = new Quaternion();
      const one = new Vector3(1, 1, 1);
      return {
        metrics: rig.metrics,
        apply(pose: Pose, pelvisY: number, pelvisZ: number, progress: number) {
          const aligned = alignedRotations(pose, footOnPlate);
          alignedRef.current = aligned;
          rig.root.position.set(-rig.hipsRest.x, pelvisY - rig.hipsRest.y, pelvisZ - rig.hipsRest.z);
          for (const [name, parent, drive] of CHAIN) {
            worldQ[name] = drive(aligned).clone().multiply(rig.restQ[name]);
            parentWorld.copy(parent ? worldQ[parent] : rig.armatureQ);
            rig.bones[name].quaternion.copy(parentWorld.invert().multiply(worldQ[name]));
          }
          for (const m of glowRef.current) m.emissiveIntensity = 0.12 + 0.45 * progress;
        },
        frame(joint: BodyJoint, target: Matrix4) {
          const aligned = alignedRef.current;
          if (!aligned) return false;
          const [boneName, drive] = JOINT_BONES[joint];
          rig.root.updateWorldMatrix(true, true);
          rig.bones[boneName].getWorldPosition(scratchPos);
          rig.root.getWorldQuaternion(scratchQ).multiply(drive(aligned));
          target.compose(scratchPos, scratchQ, one);
          return true;
        },
      };
    },
    [rig, footOnPlate],
  );

  return <primitive object={rig.root} />;
}

export function preloadAnatomy() {
  useGLTF.preload(ANATOMY_MODEL_URL);
}

export type { Side };
