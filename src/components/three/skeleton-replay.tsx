"use client";

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { Mesh, Quaternion, Vector3 } from "three";
import type { Point3 } from "@/lib/analysis/geometry";
import type { PoseFrame } from "@/lib/analysis/signals";
import { BODY_CONNECTIONS } from "@/lib/client/pose-tracker";
import { useSceneColors } from "./use-scene-colors";

export interface ReplayClock {
  time: number;
  playing: boolean;
}

const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
const UP = new Vector3(0, 1, 0);

/**
 * MediaPipe world landmarks are metres from the hip centre with y pointing down.
 * Rotate 180° about x into a y-up scene (a rotation, so left stays left) and lift the feet to the floor.
 */
function toScene(points: readonly Point3[], floorOffset: number): Vector3[] {
  return points.map((p) => new Vector3(p.x, -p.y + floorOffset, -p.z));
}

function frameAt(frames: readonly PoseFrame[], time: number): PoseFrame | undefined {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= time) lo = mid;
    else hi = mid - 1;
  }
  // Fall back to the nearest frame that has a detected pose.
  for (let d = 0; d < frames.length; d++) {
    if (frames[lo - d]?.world) return frames[lo - d];
    if (frames[lo + d]?.world) return frames[lo + d];
  }
  return undefined;
}

function Skeleton({
  frames,
  clockRef,
  duration,
  highlight,
  onTime,
}: {
  frames: readonly PoseFrame[];
  clockRef: RefObject<ReplayClock>;
  duration: number;
  highlight: readonly number[];
  onTime: (t: number) => void;
}) {
  const colors = useSceneColors();
  const joints = useRef<(Mesh | null)[]>([]);
  const bones = useRef<(Mesh | null)[]>([]);
  const lastReported = useRef(-1);

  const floorOffset = useMemo(() => {
    let lowest = 0;
    for (const f of frames) {
      if (!f.world) continue;
      for (const i of [27, 28, 31, 32]) lowest = Math.max(lowest, f.world[i]?.y ?? 0);
    }
    return lowest + 0.02;
  }, [frames]);

  useFrame((_, delta) => {
    const c = clockRef.current;
    if (c.playing) {
      c.time = (c.time + Math.min(delta, 0.1)) % Math.max(duration, 0.01);
    }
    if (Math.abs(c.time - lastReported.current) > 0.1) {
      lastReported.current = c.time;
      onTime(c.time);
    }

    const frame = frameAt(frames, c.time);
    if (!frame?.world) return;
    const points = toScene(frame.world, floorOffset);

    JOINTS.forEach((index, i) => {
      joints.current[i]?.position.copy(points[index]);
    });
    BODY_CONNECTIONS.forEach(([a, b], i) => {
      const mesh = bones.current[i];
      if (!mesh) return;
      const dir = new Vector3().subVectors(points[b], points[a]);
      const len = dir.length();
      mesh.position.copy(points[a]).add(points[b]).multiplyScalar(0.5);
      mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.normalize()));
      mesh.scale.set(1, len, 1);
    });
  });

  return (
    <group>
      {JOINTS.map((index, i) => (
        <mesh key={index} ref={(m) => void (joints.current[i] = m)} castShadow>
          <sphereGeometry args={[index === 0 ? 0.09 : 0.03, 16, 12]} />
          <meshStandardMaterial color={highlight.includes(index) ? colors.primary : colors.body} />
        </mesh>
      ))}
      {BODY_CONNECTIONS.map(([a, b], i) => {
        const hot = highlight.includes(a) && highlight.includes(b);
        return (
          <mesh key={`${a}-${b}`} ref={(m) => void (bones.current[i] = m)} castShadow>
            <cylinderGeometry args={[hot ? 0.024 : 0.018, hot ? 0.024 : 0.018, 1, 10]} />
            <meshStandardMaterial
              color={hot ? colors.primary : colors.body}
              emissive={hot ? colors.primary : "#000000"}
              emissiveIntensity={hot ? 0.3 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function SkeletonReplay(props: {
  frames: readonly PoseFrame[];
  clockRef: RefObject<ReplayClock>;
  duration: number;
  highlight: readonly number[];
  onTime: (t: number) => void;
}) {
  const colors = useSceneColors();
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [2.2, 1.4, 2.4], fov: 38 }} gl={{ alpha: true }}>
      <hemisphereLight args={["#ffffff", colors.floor, 1.1]} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.6, 64]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>
      <ContactShadows position={[0, 0.002, 0]} opacity={0.3} scale={4} blur={2.4} far={2.5} />
      <Skeleton {...props} />
      <OrbitControls makeDefault enablePan={false} minDistance={1.5} maxDistance={6} target={[0, 0.8, 0]} />
    </Canvas>
  );
}
