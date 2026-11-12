import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { SiteHeader } from "@/components/ui/site-header";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Spotter: learn any gym machine", template: "%s · Spotter" },
  description:
    "Photograph a gym machine to see a 3D demonstration, the muscles it works and how to set it up. Film a set to get form fixes.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f0" },
    { media: "(prefers-color-scheme: dark)", color: "#121517" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-6 text-small text-steel sm:px-8">
          <p className="mx-auto max-w-6xl">
            Spotter gives general exercise guidance, not medical advice. Stop if anything hurts, and ask gym staff
            if a machine looks damaged.
          </p>
        </footer>
      </body>
    </html>
  );
}
