import { DO_NOT_PAY_AGAIN, sourceText, type NextAction } from "@/lib/next-best-action";
import type { IncidentCopy } from "@/lib/i18n-incident";

/** The one next action. Never a list; the source line is always present. */
export function NextActionCard({
  action,
  locale,
  t,
}: {
  action: NextAction;
  locale: "fr" | "en";
  t: IncidentCopy;
}) {
  const verified = action.source.status === "verified";
  return (
    <section
      aria-labelledby="next-action"
      className="rounded-card border border-navy/30 bg-navy-soft p-4 shadow-card sm:p-5"
    >
      <p id="next-action" className="text-xs font-semibold uppercase tracking-wider text-navy">
        {action.audience === "reviewer" ? t.nextTitleReviewer : t.nextTitle}
      </p>
      <h2 className="mt-1 font-display text-lg font-semibold text-fg">{action.title[locale]}</h2>
      <p className="mt-1 text-sm text-fg-muted">{action.why[locale]}</p>

      {action.doNotPayAgain && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-text/40 bg-amber-soft px-3 py-2 text-sm font-medium text-amber-text">
          <svg viewBox="0 0 14 14" className="mt-0.5 h-4 w-4 shrink-0" stroke="currentColor" aria-hidden="true">
            <path d="M7 2.6v5" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="7" cy="10.8" r="0.95" fill="currentColor" strokeWidth="0" />
          </svg>
          <span>
            <span className="sr-only">
              {t.doNotPayAgain}
              {t.colon}
            </span>
            {DO_NOT_PAY_AGAIN[locale]}
          </span>
        </p>
      )}

      <p className="mt-3 text-xs text-fg-muted">
        <span className="font-semibold">{t.source}
          {t.colon.trimEnd()}
        </span>{" "}
        <span className={verified ? "" : "font-semibold text-amber-text"}>{sourceText(action.source, locale)}</span>
        {action.source.status === "verified" && (
          <span className="block font-mono text-[11px] text-fg-subtle">{action.source.ref}</span>
        )}
      </p>
    </section>
  );
}
