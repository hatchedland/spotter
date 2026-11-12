"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { MUSCLE_LABELS, type MuscleTargets } from "@/lib/exercise/muscles";
import type { MovementPattern } from "@/lib/exercise/patterns";
import type { RepPhase } from "@/lib/exercise/pose";
import type { PlaybackControl } from "@/components/three/demonstrator";
import type { CameraView } from "@/components/three/exercise-stage";

const ExerciseStage = dynamic(() => import("@/components/three/exercise-stage").then((m) => m.ExerciseStage), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-sunk" aria-hidden />,
});

const BACK_MUSCLES = new Set(["lats", "upper_back", "lower_back", "rear_delts", "triceps", "glutes", "hamstrings", "calves"]);

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

interface ExerciseDemoProps {
  pattern: MovementPattern;
  /** Muscles to highlight. Defaults to the pattern's own targets. */
  muscles?: MuscleTargets;
}

export function ExerciseDemo({ pattern, muscles = pattern.muscles }: ExerciseDemoProps) {
  const reducedMotion = usePrefersReducedMotion();
  const control = useRef<PlaybackControl>({ playing: false, scrub: 0 });
  /** null until the person presses Play/Pause; until then motion follows their system setting. */
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const playing = userPlaying ?? !reducedMotion;
  const [scrub, setScrub] = useState(0);
  const [phase, setPhase] = useState<RepPhase>("rest");
  const [view, setView] = useState<CameraView>(() =>
    muscles.primary.some((m) => BACK_MUSCLES.has(m)) ? "back" : "front",
  );
  const sliderId = useId();

  useEffect(() => {
    control.current.playing = playing;
  }, [playing]);

  const togglePlay = () => setUserPlaying(!playing);

  const onScrub = (value: number) => {
    control.current.playing = false;
    control.current.scrub = value;
    setUserPlaying(false);
    setScrub(value);
    setPhase(value > 0.5 ? "hold" : "rest");
  };

  const activeStep = playing ? (phase === "lift" || phase === "hold" ? "lift" : "lower") : scrub > 0.5 ? "lift" : null;

  return (
    <section aria-labelledby={`${sliderId}-title`} className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <div className="overflow-hidden rounded-panel bg-surface">
        <div className="aspect-[4/5] sm:aspect-square">
          <ExerciseStage
            motion={pattern}
            muscles={muscles}
            controlRef={control}
            view={view}
            label={`3D figure demonstrating the ${pattern.name}, with the working muscles highlighted in blue.`}
            onPhaseChange={setPhase}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex min-h-11 min-w-20 items-center justify-center rounded-control bg-ink px-4 font-semibold text-chalk"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <label htmlFor={sliderId} className="sr-only">
            Position in the rep
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={playing ? 0 : scrub}
            onChange={(e) => onScrub(Number(e.target.value))}
            className="h-11 min-w-32 flex-1 accent-plate"
            aria-valuetext={scrub < 0.1 ? "Start position" : scrub > 0.9 ? "End position" : `${Math.round(scrub * 100)}% of the rep`}
          />
          <div role="radiogroup" aria-label="Camera angle" className="flex rounded-control bg-surface-sunk p-1">
            {(["front", "side", "back"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
                className={`min-h-9 rounded-[0.45rem] px-3 text-small font-medium capitalize ${
                  view === v ? "bg-surface text-ink shadow-sm" : "text-steel"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <h2 id={`${sliderId}-title`} className="sr-only">
          How the movement works
        </h2>

        <ol className="grid gap-2">
          <PhaseStep
            active={activeStep === "lift"}
            name="Lift"
            seconds={pattern.tempo.lift}
            text={pattern.lift}
          />
          <PhaseStep
            active={activeStep === "lower"}
            name="Lower"
            seconds={pattern.tempo.lower}
            text={pattern.lower}
          />
        </ol>

        <MuscleLegend muscles={muscles} />
      </div>
    </section>
  );
}

function PhaseStep({ active, name, seconds, text }: { active: boolean; name: string; seconds: number; text: string }) {
  return (
    <li
      aria-current={active ? "step" : undefined}
      className={`rounded-control border-l-4 px-4 py-3 transition-colors ${
        active ? "border-plate bg-plate-wash" : "border-line bg-surface"
      }`}
    >
      <p className="font-display text-h3 font-bold">
        {name}
        <span className="ml-2 font-sans text-small font-medium text-steel">
          {seconds} {seconds === 1 ? "second" : "seconds"}
        </span>
      </p>
      <p className="mt-1">{text}</p>
    </li>
  );
}

function MuscleLegend({ muscles }: { muscles: MuscleTargets }) {
  return (
    <div className="grid gap-3">
      <div>
        <h3 className="font-display text-h3 font-bold">Main muscles</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {muscles.primary.map((m) => (
            <li key={m} className="rounded-full bg-plate px-3 py-1 text-small font-semibold text-plate-ink">
              {MUSCLE_LABELS[m]}
            </li>
          ))}
        </ul>
      </div>
      {muscles.secondary.length ? (
        <div>
          <h3 className="font-display text-h3 font-bold">Also working</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {muscles.secondary.map((m) => (
              <li key={m} className="rounded-full border-2 border-plate-soft px-3 py-0.5 text-small font-medium">
                {MUSCLE_LABELS[m]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
