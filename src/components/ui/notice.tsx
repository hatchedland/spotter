import type { ReactNode } from "react";

type Tone = "info" | "warning" | "error";

const TONES: Record<Tone, string> = {
  info: "bg-plate-wash text-ink",
  warning: "bg-fix-wash text-ink",
  error: "bg-danger-wash text-ink",
};

/** Inline status message. Errors are announced to screen readers immediately. */
export function Notice({ tone = "info", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-control px-4 py-3 ${TONES[tone]}`}>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 text-small">{children}</div> : null}
    </div>
  );
}
