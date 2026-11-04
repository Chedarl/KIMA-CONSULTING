import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A section title with the gold rule under it.
 *
 * This is the one place gold appears besides the logo node. The owner's UX
 * principles put it there and nowhere else: gold shapes and rules, on white
 * only. It is drawn as a 2px underline the width of the TITLE, not of the
 * column, which is what makes a page read as a stack of sections rather than a
 * run of cards.
 *
 * The rule is `border-gold`, never `text-gold`. #C9A227 as text on white is
 * 2.3:1 and fails; gold text is the darker #8A6D12. That is why the token map
 * keeps `gold` and `gold-text` apart -- so the rule colour cannot quietly be
 * reached for as a text colour.
 *
 * `action` is the "Voir tout →" the dashboard spec puts opposite the title.
 */
export function SectionHeading({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-7 flex items-end justify-between gap-4", className)}>
      <h2 className="inline-block border-b-2 border-gold pb-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-fg">
        {children}
      </h2>
      {action ? <div className="pb-1.5 text-xs font-semibold text-teal-text">{action}</div> : null}
    </div>
  );
}
