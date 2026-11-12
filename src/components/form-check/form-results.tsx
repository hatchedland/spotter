"use client";

import dynamic from "next/dynamic";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { ReplayClock } from "@/components/three/skeleton-replay";
import { FLAG_COPY } from "@/lib/analysis/metrics";
import { median } from "@/lib/analysis/reps";
import { signalLandmarks } from "@/lib/analysis/signals";
import type { TrackedClip } from "@/lib/client/pose-tracker";
import type { MovementPattern } from "@/lib/exercise/patterns";
import type { Review, SetMetrics } from "@/lib/schemas";
import type { ReviewState } from "./form-check-flow";

const SkeletonReplay = dynamic(() => import("@/components/three/skeleton-replay").then((m) => m.SkeletonReplay), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-sunk" aria-hidden />,
});

const VERDICT_COPY: Record<Review["verdict"], { title: string; tone: string }> = {
  solid: { title: "Solid set", tone: "text-good" },
  needs_work: { title: "Good start, a few things to fix", tone: "text-fix" },
  unsafe: { title: "Fix this before your next set", tone: "text-danger" },
  unclear: { title: "We couldn't see enough", tone: "text-steel" },
};

const SEVERITY_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "Fix first",
  medium: "Worth fixing",
  low: "Fine-tune",
};

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface FormResultsProps {
  pattern: MovementPattern;
  clip: TrackedClip;
  metrics: SetMetrics;
  review: ReviewState;
  onRetry: () => void;
}

export function FormResults({ pattern, clip, metrics, review, onRetry }: FormResultsProps) {
  const clockRef = useRef<ReplayClock>({ time: 0, playing: true });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const sliderId = useId();
  const highlight = signalLandmarks(pattern.analysis.signal);

  const jumpTo = (t: number) => {
    clockRef.current.time = t;
    clockRef.current.playing = false;
    setPlaying(false);
    setTime(t);
  };

  const togglePlay = () => {
    clockRef.current.playing = !playing;
    setPlaying(!playing);
  };

  const unit = metrics.signalUnit === "deg" ? "°" : "×";
  const ranges = metrics.reps.map((r) => Math.abs(r.peakValue - r.startValue));
  const avgRange = ranges.length ? median(ranges) : 0;
  const targetRange = Math.abs(metrics.targetEnd - metrics.targetStart);
  const lowerSec = metrics.reps.length ? median(metrics.reps.map((r) => r.lowerSec)) : 0;

  const fallbackFixes = metrics.flags.map((flag) => ({ ...FLAG_COPY[flag], why: "", severity: "medium" as const, timeSec: null }));

  return (
    <div className="grid gap-8">
      <header aria-live="polite">
        {review.status === "done" ? (
          <>
            <h2 className={`font-display text-h1 font-bold ${VERDICT_COPY[review.review.verdict].tone}`}>
              {VERDICT_COPY[review.review.verdict].title}
            </h2>
            <p className="mt-3 max-w-prose">{review.review.summary}</p>
          </>
        ) : (
          <h2 className="font-display text-h1 font-bold">Your {pattern.name.toLowerCase()}</h2>
        )}
      </header>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-panel bg-line">
        <Stat label="Reps counted" value={String(metrics.reps.length)} />
        <Stat
          label="Typical range"
          value={metrics.reps.length ? `${avgRange.toFixed(metrics.signalUnit === "deg" ? 0 : 1)}${unit}` : "–"}
          note={`Aim for about ${targetRange.toFixed(metrics.signalUnit === "deg" ? 0 : 1)}${unit}`}
        />
        <Stat
          label="Lowering time"
          value={metrics.reps.length ? `${lowerSec.toFixed(1)} s` : "–"}
          note="Aim for 2 s"
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby={`${sliderId}-replay`} className="overflow-hidden rounded-panel bg-surface">
          <h3 id={`${sliderId}-replay`} className="px-4 pt-4 font-display text-h3 font-bold">
            Your movement in 3D
          </h3>
          <p className="px-4 text-small text-steel">Drag to rotate. The tracked joints are in blue.</p>
          <div className="aspect-square" role="img" aria-label={`3D replay of your ${pattern.name} set, reconstructed from your video.`}>
            <SkeletonReplay frames={clip.frames} clockRef={clockRef} duration={clip.duration} highlight={highlight} onTime={setTime} />
          </div>
          <div className="flex items-center gap-3 border-t border-line px-4 py-3">
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex min-h-11 min-w-20 items-center justify-center rounded-control bg-ink px-4 font-semibold text-chalk"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <label htmlFor={sliderId} className="sr-only">
              Replay position
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={clip.duration}
              step={0.05}
              value={time}
              onChange={(e) => jumpTo(Number(e.target.value))}
              aria-valuetext={formatTime(time)}
              className="h-11 flex-1 accent-plate"
            />
            <span className="w-10 text-right text-small tabular-nums text-steel">{formatTime(time)}</span>
          </div>
          {metrics.reps.length ? (
            <div className="flex flex-wrap gap-2 px-4 pb-4">
              {metrics.reps.map((r) => (
                <button
                  key={r.index}
                  type="button"
                  onClick={() => jumpTo(r.startSec)}
                  className="min-h-9 rounded-control bg-surface-sunk px-3 text-small font-medium"
                >
                  Rep {r.index + 1}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section aria-labelledby={`${sliderId}-fixes`} className="grid gap-4">
          <h3 id={`${sliderId}-fixes`} className="font-display text-h2 font-bold">
            What to fix
          </h3>

          {review.status === "loading" ? (
            <p role="status" className="text-steel">
              Your coach is reviewing the set…
            </p>
          ) : null}

          {review.status === "error" ? (
            <Notice tone="warning" title="Coaching notes are unavailable">
              <p>{review.message} These points come from your measurements.</p>
            </Notice>
          ) : null}

          {review.status === "done" ? (
            <FixList fixes={review.review.fixes} onJump={jumpTo} />
          ) : review.status === "error" ? (
            fallbackFixes.length ? (
              <FixList fixes={fallbackFixes} onJump={jumpTo} />
            ) : (
              <p>Your measurements didn&apos;t show any problems.</p>
            )
          ) : null}

          {review.status === "done" && review.review.strengths.length ? (
            <div>
              <h4 className="font-semibold">What you did well</h4>
              <ul className="mt-2 grid list-disc gap-1 pl-5">
                {review.review.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {review.status === "done" ? (
            <div className="rounded-control bg-plate px-4 py-3 text-plate-ink">
              <p className="text-small font-medium opacity-90">On your next set, think</p>
              <p className="font-display text-h3 font-bold">{review.review.nextSetCue}</p>
            </div>
          ) : null}
        </section>
      </div>

      <div>
        <Button variant="secondary" onClick={onRetry}>
          Film another set
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface px-4 py-4">
      <dt className="text-small text-steel">{label}</dt>
      <dd className="font-display text-h2 font-bold tabular-nums">{value}</dd>
      {note ? <dd className="text-small text-steel">{note}</dd> : null}
    </div>
  );
}

function FixList({
  fixes,
  onJump,
}: {
  fixes: readonly { title: string; why: string; how: string; severity: "high" | "medium" | "low"; timeSec: number | null }[];
  onJump: (t: number) => void;
}) {
  if (!fixes.length) return <p>Nothing major to fix. Keep the same setup and add weight gradually.</p>;
  return (
    <ol className="grid gap-3">
      {fixes.map((fix) => (
        <li
          key={fix.title}
          className={`rounded-control border-l-4 bg-surface px-4 py-3 ${
            fix.severity === "high" ? "border-danger" : fix.severity === "medium" ? "border-fix" : "border-line"
          }`}
        >
          <p className="text-small font-medium text-steel">{SEVERITY_LABEL[fix.severity]}</p>
          <p className="font-semibold">{fix.title}</p>
          {fix.why ? <p className="mt-1 text-steel">{fix.why}</p> : null}
          <p className="mt-1">{fix.how}</p>
          {fix.timeSec !== null ? (
            <button
              type="button"
              onClick={() => onJump(fix.timeSec ?? 0)}
              className="mt-2 min-h-9 text-small font-semibold text-plate underline-offset-4 hover:underline"
            >
              Show me at {formatTime(fix.timeSec)}
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
