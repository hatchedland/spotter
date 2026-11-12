"use client";

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from "react";
import type { Mesh } from "three";
import type { MuscleTargets } from "@/lib/exercise/muscles";
import type { RepPhase } from "@/lib/exercise/pose";
import { Demonstrator, type DemonstratorMotion, type PlaybackControl } from "./demonstrator";
import { useSceneColors } from "./use-scene-colors";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

export type CameraView = "front" | "side" | "back";

const VIEWS: Record<CameraView, [number, number, number]> = {
  front: [1.9, 1.55, 2.9],
  side: [3.4, 1.3, 0.2],
  back: [-1.9, 1.55, -2.9],
};
const TARGET: [number, number, number] = [0, 0.9, 0.1];

function CameraRig({ view, controls }: { view: CameraView; controls: RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...VIEWS[view]);
    controls.current?.target.set(...TARGET);
    controls.current?.update();
  }, [camera, controls, view]);
  return null;
}

/** A horizontal scan plane sweeping up and down the figure. */
function ScanSweep({ color }: { color: string }) {
  const plane = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!plane.current) return;
    const t = (Math.sin(clock.elapsedTime * 1.2) + 1) / 2;
    plane.current.position.y = 0.1 + t * 2.0;
  });
  return (
    <mesh ref={plane} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.02, 1.25, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
    </mesh>
  );
}

interface ExerciseStageProps {
  motion: DemonstratorMotion;
  muscles: MuscleTargets;
  controlRef: RefObject<PlaybackControl>;
  view: CameraView;
  label: string;
  scanning?: boolean;
  interactive?: boolean;
  onPhaseChange?: (phase: RepPhase) => void;
}

export function ExerciseStage({
  motion,
  muscles,
  controlRef,
  view,
  label,
  scanning = false,
  interactive = true,
  onPhaseChange,
}: ExerciseStageProps) {
  const colors = useSceneColors();
  const controls = useRef<OrbitControlsImpl>(null);
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  // Stop rendering when the canvas is scrolled out of view, to save battery.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "100px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className="h-full w-full" role="img" aria-label={label}>
      <Canvas
        shadows
        dpr={[1, 2]}
        frameloop={visible ? "always" : "never"}
        camera={{ position: VIEWS[view], fov: 38, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: true }}
      >
        <hemisphereLight args={["#ffffff", colors.floor, 1.1]} />
        <directionalLight
          position={[2.5, 4, 3]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-2}
          shadow-camera-right={2}
          shadow-camera-top={3}
          shadow-camera-bottom={-1}
        />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[1.8, 64]} />
          <meshStandardMaterial color={colors.floor} roughness={1} />
        </mesh>
        <ContactShadows position={[0, 0.002, 0]} opacity={0.35} scale={4} blur={2.4} far={2.5} />

        <Demonstrator motion={motion} muscles={muscles} colors={colors} controlRef={controlRef} onPhaseChange={onPhaseChange} />
        {scanning ? <ScanSweep color={colors.primary} /> : null}

        <OrbitControls
          ref={controls}
          makeDefault
          enabled={interactive}
          enablePan={false}
          minDistance={2}
          maxDistance={6}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2 - 0.05}
          target={TARGET}
        />
        <CameraRig view={view} controls={controls} />
      </Canvas>
    </div>
  );
}
