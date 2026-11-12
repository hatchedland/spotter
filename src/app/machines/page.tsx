import type { Metadata } from "next";
import Link from "next/link";
import { MUSCLE_LABELS } from "@/lib/exercise/muscles";
import { PATTERN_LIST } from "@/lib/exercise/patterns";

export const metadata: Metadata = {
  title: "Machines",
  description: "Step-by-step 3D guides for the most common gym machines.",
};

export default function MachinesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <h1 className="font-display text-h1 font-bold">Machines</h1>
      <p className="mt-3 max-w-prose text-steel">
        Can&apos;t scan right now? Find your machine here. Each guide shows the movement in 3D, the muscles it
        works and how to set it up.
      </p>

      <ul className="mt-8 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {PATTERN_LIST.map((p) => (
          <li key={p.id} className="bg-surface">
            <Link href={`/machines/${p.id}`} className="block h-full px-5 py-4 hover:bg-plate-wash">
              <span className="font-display text-h3 font-bold">{p.name}</span>
              <span className="mt-1 block text-small text-steel">
                {p.muscles.primary.map((m) => MUSCLE_LABELS[m]).join(", ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
