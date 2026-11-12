import { HeroFigure } from "@/components/guide/hero-figure";
import { ButtonLink } from "@/components/ui/button";

const STEPS = [
  {
    title: "Scan the machine",
    body: "Take a photo of any machine on the gym floor. Spotter recognises it and reads the adjustments it can see.",
  },
  {
    title: "Watch it in 3D",
    body: "A figure shows the full movement at the right speed, with the muscles it works lit up. Turn it to see from any side.",
  },
  {
    title: "Film your set",
    body: "Prop up your phone and record a set. You get your rep count, range of motion and the one or two fixes that matter.",
  },
] as const;

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 pt-8 pb-12 sm:px-8 md:grid-cols-[1fr_1.1fr] md:pt-14">
        <div>
          <h1 className="font-display text-h1 font-bold uppercase">Know the machine before you sit down.</h1>
          <p className="mt-5 max-w-[34rem] text-steel">
            Every gym has different equipment. Photograph a machine to see exactly how it&apos;s used, which muscles it
            works and how to set it up. Then film a set and get specific fixes for your form.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/scan">Scan a machine</ButtonLink>
            <ButtonLink href="/form-check" variant="secondary">
              Check my form
            </ButtonLink>
          </div>
        </div>
        <div className="aspect-square w-full">
          <HeroFigure />
        </div>
      </section>

      <section aria-labelledby="how-title" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
          <h2 id="how-title" className="font-display text-h2 font-bold">
            How it works
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-3">
                <span aria-hidden className="font-display text-h2 leading-none font-bold text-plate">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-h3 font-bold">{step.title}</h3>
                  <p className="mt-2 text-steel">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <h2 className="font-display text-h2 font-bold">Your video stays on your phone</h2>
        <p className="mt-3 max-w-prose text-steel">
          Movement tracking runs in your browser. For coaching, Spotter sends three still frames and the joint
          measurements, never the video itself. Spotter does not save your photos, frames or results.
        </p>
      </section>
    </>
  );
}
