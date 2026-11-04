import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One status pill for the whole product.
 *
 * There were two. The workspace had StatusChip, which takes a declaration's
 * StatusKind and looks the label up itself -- semantic, and right. The portal
 * had Pill, which takes `tone="green"` and arbitrary children, so the colour
 * was chosen at each call site. That is how "Payé" ends up green on a screen
 * with no payment evidence behind it.
 *
 * This replaces the colour vocabulary with a meaning vocabulary. A caller says
 * what the state IS, not what colour it should be, and the mapping from a
 * domain's own statuses to these tones happens once per domain rather than at
 * every call site.
 *
 * The tones are not interchangeable:
 *
 *   confirmed  something is verified and there is evidence behind it
 *   awaiting   correct, and waiting on somebody
 *   attention  the reader has to do something
 *   estimated  a calculation or a provisional date -- NOT a fact
 *   neutral    a state with no judgement attached
 *   refused    rejected, returned, failed
 *
 * `estimated` is drawn with a dashed border on purpose. A provisional deadline
 * and a statutory one must not look alike: ministerial prorogations are routine
 * under art. 16 LF 2025, and a date that may move has to read differently from
 * a date that has not. The dash is the one piece of visual grammar in here that
 * carries a rule rather than a preference.
 *
 * Tone is never the only carrier of meaning. The label says it in words, and
 * `note` adds the longer reason for screen readers and on hover.
 */
export type StatusTone =
  | "confirmed"
  | "awaiting"
  | "attention"
  | "estimated"
  | "neutral"
  | "returned"
  | "refused";

const TONES: Record<StatusTone, string> = {
  confirmed: "border-success-text/30 bg-success-soft text-success-text",
  awaiting: "border-teal-text/30 bg-teal-soft text-teal-text",
  attention: "border-amber-text/30 bg-amber-soft text-amber-text",
  estimated: "border-dashed border-amber-text/50 bg-transparent text-amber-text",
  neutral: "border-border bg-surface-sunken text-fg-muted",
  // Renvoyé. Indigo, and NOT refused: the owner's UX principles make returned
  // a separate outcome that always carries a motif -- the work came back to be
  // corrected, it was not thrown out. Drawn with a solid ring rather than a
  // soft fill so it cannot be mistaken for `awaiting`, which is indigo too.
  returned: "border-teal-text bg-surface text-teal-text",
  refused: "border-danger-text/30 bg-danger-soft text-danger-text",
};

export function StatusPill({
  tone,
  children,
  note,
  size = "md",
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  /** The longer reason. Announced, and shown on hover. */
  note?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      title={note}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONES[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full bg-current",
          // An estimate gets a hollow marker, so the distinction survives at a
          // glance and in a screenshot, not only in the border.
          tone === "estimated" && "bg-transparent ring-1 ring-current",
        )}
      />
      {children}
      {note && <span className="sr-only"> — {note}</span>}
    </span>
  );
}
