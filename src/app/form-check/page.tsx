import type { Metadata } from "next";
import { Suspense } from "react";
import { FormCheckFlow } from "@/components/form-check/form-check-flow";

export const metadata: Metadata = {
  title: "Form check",
  description: "Film a set and get specific fixes for your form.",
};

export default function FormCheckPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <header>
        <h1 className="font-display text-h1 font-bold">Form check</h1>
        <p className="mt-3 max-w-prose text-steel">
          Film one set from the side. Spotter counts your reps, measures your range and speed, and tells you what to
          fix on the next set.
        </p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-panel bg-surface" aria-hidden />}>
        <FormCheckFlow />
      </Suspense>
    </div>
  );
}
