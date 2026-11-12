import type { Metadata } from "next";
import { ScanFlow } from "@/components/scan/scan-flow";

export const metadata: Metadata = {
  title: "Scan a machine",
  description: "Photograph a gym machine to see how to use it.",
};

export default function ScanPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <header>
        <h1 className="font-display text-h1 font-bold">Scan a machine</h1>
        <p className="mt-3 max-w-prose text-steel">
          Take a photo and Spotter will show you how to use the machine, which muscles it works and how to set it up.
        </p>
      </header>
      <ScanFlow />
    </div>
  );
}
