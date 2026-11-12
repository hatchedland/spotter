import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExerciseGuide } from "@/components/guide/exercise-guide";
import { getPattern, isPatternId, PATTERN_IDS } from "@/lib/exercise/patterns";

export function generateStaticParams() {
  return PATTERN_IDS.map((pattern) => ({ pattern }));
}

export async function generateMetadata({ params }: PageProps<"/machines/[pattern]">): Promise<Metadata> {
  const { pattern } = await params;
  if (!isPatternId(pattern)) return {};
  const p = getPattern(pattern);
  return { title: `How to use the ${p.name.toLowerCase()}`, description: p.summary };
}

export default async function MachinePage({ params }: PageProps<"/machines/[pattern]">) {
  const { pattern: id } = await params;
  if (!isPatternId(id)) notFound();
  const pattern = getPattern(id);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <header>
        <Link href="/machines" className="text-small font-medium text-steel hover:text-ink">
          All machines
        </Link>
        <h1 className="mt-2 font-display text-h1 font-bold">{pattern.name}</h1>
        <p className="mt-3 max-w-prose text-steel">{pattern.summary}</p>
      </header>
      <ExerciseGuide pattern={pattern} />
    </div>
  );
}
