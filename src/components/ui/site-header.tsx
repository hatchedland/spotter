import Link from "next/link";

const NAV = [
  { href: "/scan", label: "Scan" },
  { href: "/machines", label: "Machines" },
  { href: "/form-check", label: "Form check" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link href="/" className="font-display text-2xl font-bold tracking-tight">
          Spotter
        </Link>
        <nav aria-label="Main">
          <ul className="flex gap-1 text-small font-medium sm:gap-3">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-control px-2.5 text-steel hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
