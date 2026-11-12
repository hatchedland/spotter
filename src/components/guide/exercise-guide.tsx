import type { MuscleTargets } from "@/lib/exercise/muscles";
import type { MovementPattern } from "@/lib/exercise/patterns";
import { ButtonLink } from "@/components/ui/button";
import { ExerciseDemo } from "./exercise-demo";

interface ExerciseGuideProps {
  pattern: MovementPattern;
  muscles?: MuscleTargets;
  /** Setup details read from a photo of this specific machine. */
  machineNotes?: readonly string[];
}

export function ExerciseGuide({ pattern, muscles, machineNotes = [] }: ExerciseGuideProps) {
  return (
    <div className="grid gap-10">
      <ExerciseDemo pattern={pattern} muscles={muscles} />

      <div className="grid gap-10 md:grid-cols-2">
        <section aria-labelledby="setup-title">
          <h2 id="setup-title" className="font-display text-h2 font-bold">
            Set up the machine
          </h2>
          <ol className="mt-4 grid gap-3">
            {pattern.setup.map((step, i) => (
              <li key={step} className="grid grid-cols-[2rem_1fr] gap-2">
                <span aria-hidden className="font-display text-h3 font-bold text-plate">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {machineNotes.length ? (
            <div className="mt-6 rounded-control bg-plate-wash px-4 py-3">
              <h3 className="font-semibold">On the machine in your photo</h3>
              <ul className="mt-2 grid list-disc gap-1 pl-5">
                {machineNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="cues-title">
          <h2 id="cues-title" className="font-display text-h2 font-bold">
            Think about
          </h2>
          <ul className="mt-4 grid gap-2">
            {pattern.cues.map((cue) => (
              <li key={cue} className="rounded-control bg-surface px-4 py-3 font-medium">
                {cue}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="mistakes-title">
        <h2 id="mistakes-title" className="font-display text-h2 font-bold">
          Common mistakes
        </h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {pattern.mistakes.map(({ mistake, fix }) => (
            <div key={mistake} className="border-t-2 border-fix pt-3">
              <dt className="font-semibold">{mistake}</dt>
              <dd className="mt-1 text-steel">{fix}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-4 rounded-panel bg-ink px-6 py-8 text-chalk sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-h2 font-bold">Done a set? Check your form.</h2>
          <p className="mt-1 max-w-prose opacity-80">{pattern.analysis.cameraTip}</p>
        </div>
        <ButtonLink href={`/form-check?exercise=${pattern.id}`} className="shrink-0">
          Check my form
        </ButtonLink>
      </section>
    </div>
  );
}
