import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getIncidentCopy } from "@/lib/i18n-incident";
import { IncidentPrototype } from "@/components/prototype/incident-prototype";

/**
 * Incident-recovery prototype (Agent B) — "debited, payment not recognised".
 *
 * Synthetic data only (`lib/mocks/incidents.ts`), local state only, no backend.
 * Not linked from any navigation and not indexed. The plan behind it is in
 * `docs/strategy/2026-10-27-taxpayer-first/agent-b/`.
 */

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const t = getIncidentCopy(isLocale(params.locale) ? params.locale : "fr");
  return {
    title: `${t.banner} · ${t.title}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

export default function IncidentPrototypePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getIncidentCopy(locale);

  return (
    <main id="main" className="min-h-screen bg-surface-sunken">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:py-8">
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-card border-2 border-dashed border-amber-text/50 bg-amber-soft px-4 py-2.5 text-sm text-amber-text"
        >
          <svg viewBox="0 0 14 14" className="mt-0.5 h-4 w-4 shrink-0" stroke="currentColor" aria-hidden="true">
            <path d="M7 2.6v5" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="7" cy="10.8" r="0.95" fill="currentColor" strokeWidth="0" />
          </svg>
          <p>
            <strong className="font-semibold">{t.banner}</strong>
            <span className="hidden sm:inline"> — {t.bannerBody}</span>
          </p>
        </div>

        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-text">{t.eyebrow}</p>
          <h1 className="font-display text-xl font-bold tracking-tight text-fg sm:text-3xl">{t.title}</h1>
          <p className="mt-1 hidden max-w-3xl text-sm text-fg-muted sm:block">{t.lede}</p>
        </header>

        <IncidentPrototype locale={locale} t={t} />

        <footer className="border-t border-border pt-4 text-xs text-fg-muted">
          <p className="sm:hidden">{t.bannerBody}</p>
          <p className="mt-1">{t.notAcf}</p>
        </footer>
      </div>
    </main>
  );
}
