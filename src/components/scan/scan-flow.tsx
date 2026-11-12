"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ExerciseGuide } from "@/components/guide/exercise-guide";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ApiRequestError, identifyMachine } from "@/lib/client/api";
import { photoToDataUrl } from "@/lib/client/image";
import { getPattern, type PatternId } from "@/lib/exercise/patterns";
import type { Identification } from "@/lib/schemas";

type ScanState =
  | { status: "idle" }
  | { status: "identifying"; photo: string }
  | { status: "done"; photo: string; result: Identification; selected: PatternId | null }
  | { status: "error"; photo: string | null; message: string };

export function ScanFlow() {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const inputId = useId();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    let photo: string;
    try {
      photo = await photoToDataUrl(file);
    } catch (error) {
      setState({ status: "error", photo: null, message: error instanceof Error ? error.message : "We couldn't open that photo." });
      return;
    }

    setState({ status: "identifying", photo });
    try {
      const result = await identifyMachine({ image: photo }, controller.signal);
      const selected = result.pattern === "unsupported" ? null : result.pattern;
      setState({ status: "done", photo, result, selected });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof ApiRequestError ? error.message : "Something went wrong. Try again.";
      setState({ status: "error", photo, message });
    }
  }

  const captureButton = (label: string, variant: "primary" | "secondary" = "primary") => (
    <label htmlFor={inputId} className={buttonClass(variant, "cursor-pointer")}>
      {label}
    </label>
  );

  return (
    <div className="grid gap-8">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {state.status === "idle" ? (
        <div className="grid gap-6 rounded-panel border-2 border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="mx-auto max-w-md text-steel">
            Stand back far enough to fit the whole machine in the photo, including the seat, pads and handles.
          </p>
          <div className="flex flex-col items-center gap-3">
            {captureButton("Take a photo")}
            <Link href="/machines" className={buttonClass("quiet")}>
              Choose from the list instead
            </Link>
          </div>
        </div>
      ) : null}

      {state.status === "identifying" ? (
        <div className="grid gap-4">
          <ScanningPhoto photo={state.photo} />
          <p role="status" className="text-center font-medium">
            Identifying the machine…
          </p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="grid gap-4">
          {state.photo ? <PhotoThumb photo={state.photo} /> : null}
          <Notice tone="error" title="We couldn't identify this machine">
            <p>{state.message}</p>
          </Notice>
          <div className="flex flex-wrap gap-3">
            {captureButton("Take another photo")}
            <ButtonLink href="/machines" variant="secondary">
              Choose from the list
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {state.status === "done" ? (
        <ScanResult
          state={state}
          onSelect={(selected) => setState({ ...state, selected })}
          retake={captureButton("Scan another machine", "secondary")}
        />
      ) : null}
    </div>
  );
}

function ScanResult({
  state,
  onSelect,
  retake,
}: {
  state: Extract<ScanState, { status: "done" }>;
  onSelect: (pattern: PatternId) => void;
  retake: ReactNode;
}) {
  const { result, selected, photo } = state;

  if (!result.isGymEquipment) {
    return (
      <div className="grid gap-4">
        <PhotoThumb photo={photo} />
        <Notice tone="warning" title="This doesn't look like gym equipment">
          <p>Take a photo that shows the whole machine, including its seat and handles.</p>
        </Notice>
        <div>{retake}</div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="grid gap-4">
        <PhotoThumb photo={photo} />
        <Notice tone="info" title={`This looks like: ${result.machineName}`}>
          <p>We don&apos;t have a 3D guide for this equipment yet. Ask gym staff for a quick demo, or pick a similar machine from the list.</p>
        </Notice>
        <div className="flex flex-wrap gap-3">
          {retake}
          <ButtonLink href="/machines" variant="secondary">
            Browse machines
          </ButtonLink>
        </div>
      </div>
    );
  }

  const pattern = getPattern(selected);
  const fromScan = selected === result.pattern;
  const muscles = fromScan ? { primary: result.primaryMuscles, secondary: result.secondaryMuscles } : pattern.muscles;
  const others = [result.pattern, ...result.alternatives].filter(
    (p): p is PatternId => p !== "unsupported" && p !== selected,
  );

  return (
    <div className="grid gap-8">
      <header className="grid gap-4 sm:grid-cols-[8rem_1fr] sm:items-center">
        <PhotoThumb photo={photo} />
        <div>
          <p className="text-small font-medium text-steel">{fromScan ? "We think this is" : "Showing"}</p>
          <h2 className="font-display text-h1 font-bold">{fromScan ? result.machineName : pattern.name}</h2>
          <p className="mt-2 max-w-prose text-steel">{pattern.summary}</p>
        </div>
      </header>

      {result.confidence !== "high" || others.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small font-medium">
            {result.confidence === "low" ? "Not a match? It could also be:" : "Other possibilities:"}
          </span>
          {others.map((id) => (
            <Button key={id} variant="secondary" className="min-h-10 px-3 text-small" onClick={() => onSelect(id)}>
              {getPattern(id).name}
            </Button>
          ))}
        </div>
      ) : null}

      <ExerciseGuide key={selected} pattern={pattern} muscles={muscles} machineNotes={fromScan ? result.machineNotes : []} />
      <div>{retake}</div>
    </div>
  );
}

function PhotoThumb({ photo }: { photo: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local data URL preview, not a remote content image
    <img src={photo} alt="Your photo of the machine" className="aspect-square w-32 rounded-control object-cover" />
  );
}

function ScanningPhoto({ photo }: { photo: string }) {
  return (
    <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-panel">
      {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
      <img src={photo} alt="Your photo of the machine, being scanned" className="w-full" />
      <div aria-hidden className="scan-line absolute inset-x-0 h-1 bg-plate shadow-[0_0_24px_6px_var(--plate)]" />
    </div>
  );
}
