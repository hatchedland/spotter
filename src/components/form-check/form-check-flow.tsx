"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { pickKeyframes } from "@/lib/analysis/keyframes";
import { analyseSet } from "@/lib/analysis/metrics";
import { signalLandmarks } from "@/lib/analysis/signals";
import { ApiRequestError, requestFormReview } from "@/lib/client/api";
import { ClipError, MAX_CLIP_SECONDS, trackClip, type TrackedClip } from "@/lib/client/pose-tracker";
import { getPattern, isPatternId, PATTERN_LIST, type PatternId } from "@/lib/exercise/patterns";
import type { Review, SetMetrics } from "@/lib/schemas";
import { FormResults } from "./form-results";

export type ReviewState =
  | { status: "loading" }
  | { status: "done"; review: Review }
  | { status: "error"; message: string };

type FlowState =
  | { status: "idle" }
  | { status: "tracking"; stage: "model" | "tracking"; progress: number }
  | { status: "results"; clip: TrackedClip; metrics: SetMetrics; review: ReviewState }
  | { status: "error"; message: string };

export function FormCheckFlow() {
  const params = useSearchParams();
  const initial = params.get("exercise");
  const [exercise, setExercise] = useState<PatternId | "">(initial && isPatternId(initial) ? initial : "");
  const [state, setState] = useState<FlowState>({ status: "idle" });
  const abort = useRef<AbortController | null>(null);
  const clipRef = useRef<TrackedClip | null>(null);
  const selectId = useId();
  const inputId = useId();

  useEffect(
    () => () => {
      abort.current?.abort();
      clipRef.current?.dispose();
    },
    [],
  );

  function reset() {
    abort.current?.abort();
    clipRef.current?.dispose();
    clipRef.current = null;
    setState({ status: "idle" });
  }

  async function onVideo(file: File | undefined) {
    if (!file || !exercise) return;
    reset();
    const controller = new AbortController();
    abort.current = controller;
    const pattern = getPattern(exercise);

    let clip: TrackedClip;
    try {
      setState({ status: "tracking", stage: "model", progress: 0 });
      clip = await trackClip(
        file,
        (progress, stage) => setState({ status: "tracking", stage, progress }),
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("[form-check] tracking failed", error);
      const message =
        error instanceof ClipError
          ? error.message
          : "We couldn't load the movement tracker. Check your connection and try again.";
      setState({ status: "error", message });
      return;
    }
    clipRef.current = clip;

    const metrics = analyseSet(exercise, clip.frames, clip.aspectRatio);
    setState({ status: "results", clip, metrics, review: { status: "loading" } });

    try {
      const highlight = signalLandmarks(pattern.analysis.signal);
      const frames = [];
      for (const k of pickKeyframes(metrics)) {
        frames.push({ ...k, image: await clip.snapshot(k.timeSec, highlight) });
      }
      const review = await requestFormReview({ metrics, frames }, controller.signal);
      setState({ status: "results", clip, metrics, review: { status: "done", review } });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof ApiRequestError ? error.message : "Coaching feedback is unavailable right now.";
      setState({ status: "results", clip, metrics, review: { status: "error", message } });
    }
  }

  const pattern = exercise ? getPattern(exercise) : null;

  return (
    <div className="grid gap-8">
      <input
        id={inputId}
        type="file"
        accept="video/*"
        capture="environment"
        className="sr-only"
        disabled={!exercise}
        onChange={(e) => {
          void onVideo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {state.status === "idle" || state.status === "error" ? (
        <div className="grid gap-6 rounded-panel bg-surface p-6 sm:p-8">
          <div className="grid gap-2">
            <label htmlFor={selectId} className="font-semibold">
              Which exercise are you doing?
            </label>
            <select
              id={selectId}
              value={exercise}
              onChange={(e) => setExercise(isPatternId(e.target.value) ? e.target.value : "")}
              className="min-h-12 rounded-control border border-ink/20 bg-surface px-3"
            >
              <option value="">Choose an exercise</option>
              {PATTERN_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {pattern ? (
            <div className="grid gap-2">
              <h2 className="font-display text-h3 font-bold">How to film it</h2>
              <ul className="grid list-disc gap-1 pl-5">
                <li>{pattern.analysis.cameraTip}</li>
                <li>Prop your phone up rather than asking someone to hold it.</li>
                <li>Record one set of 3 to 10 reps, up to {MAX_CLIP_SECONDS} seconds.</li>
              </ul>
            </div>
          ) : null}

          {state.status === "error" ? (
            <Notice tone="error" title="We couldn't analyse that clip">
              <p>{state.message}</p>
            </Notice>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor={inputId}
              aria-disabled={!exercise}
              className={buttonClass("primary", exercise ? "cursor-pointer" : "pointer-events-none opacity-50")}
            >
              Record or upload a set
            </label>
            {!exercise ? <p className="text-small text-steel">Choose an exercise first.</p> : null}
          </div>

          <p className="text-small text-steel">
            Your video stays on this device. Spotter tracks your movement in the browser and only sends three still
            frames and the joint measurements for coaching.
          </p>
        </div>
      ) : null}

      {state.status === "tracking" ? (
        <div className="grid gap-3 rounded-panel bg-surface p-6 sm:p-8">
          <p role="status" className="font-semibold">
            {state.stage === "model" ? "Loading the movement tracker…" : "Tracking your movement…"}
          </p>
          <progress
            className="h-2 w-full overflow-hidden rounded-full accent-plate"
            max={1}
            value={state.stage === "model" ? undefined : state.progress}
            aria-label="Analysis progress"
          />
          <div>
            <Button variant="quiet" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === "results" && pattern ? (
        <FormResults
          pattern={pattern}
          clip={state.clip}
          metrics={state.metrics}
          review={state.review}
          onRetry={reset}
        />
      ) : null}
    </div>
  );
}
