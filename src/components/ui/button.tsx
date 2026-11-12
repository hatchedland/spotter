import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "quiet";

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-plate text-plate-ink hover:bg-plate/90 active:bg-plate/80",
  secondary: "border border-ink/20 bg-surface text-ink hover:border-ink/40 active:bg-surface-sunk",
  quiet: "text-plate underline-offset-4 hover:underline px-2",
};

export function buttonClass(variant: Variant = "primary", className = ""): string {
  return `${BASE} ${VARIANTS[variant]} ${className}`.trim();
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
