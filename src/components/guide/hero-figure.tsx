"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { getPattern } from "@/lib/exercise/patterns";
import type { PlaybackControl } from "@/components/three/demonstrator";

const ExerciseStage = dynamic(() => import("@/components/three/exercise-stage").then((m) => m.ExerciseStage), {
  ssr: false,
  loading: () => <div className="h-full w-full" aria-hidden />,
});

const HERO = getPattern("lat_pulldown");

/** Decorative hero: a figure on a lat pulldown with a scan plane passing over it. */
export function HeroFigure() {
  const control = useRef<PlaybackControl>({ playing: true, scrub: 0.4 });

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      control.current.playing = !query.matches;
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <ExerciseStage
      motion={HERO}
      muscles={HERO.muscles}
      controlRef={control}
      view="back"
      interactive={false}
      scanning
      label="A 3D figure using a lat pulldown machine while a scan line passes over it. The back muscles doing the work are lit in blue."
    />
  );
}
