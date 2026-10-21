import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { Button, Card, Completeness, DemoBanner, StatusChip } from "@/components/ui";

/**
 * Public overview.
 *
 * Structure follows the "Trust & Authority + Conversion" pattern: hero with
 * mission and credibility, then proof, then the solution, then a clear path.
 * The hero carries a working preview of the product rather than a list of
 * feature names — a reader should see the thing, not read about it.
 */
export default function OverviewPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const hrefs = [`/${locale}/app`, `/${locale}/workspace`];

  return (
    <div className="flex flex-col gap-14 pb-4">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      {/* Hero */}
      <section className="hero-surface px-5 py-10 sm:px-10 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-text/25 bg-teal-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-text">
              {t.proposition}
            </p>
            {/* Leading is 1.18, not 1.1: French caps carry accents (Ô, É) that
                collide with the line above at tighter settings. */}
            <h1 className="text-balance text-3xl font-bold leading-[1.18] tracking-tight text-fg sm:text-4xl lg:text-[3rem]">
              {t.home.heroTitle}
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-fg-muted">
              {t.home.heroBody}
            </p>
            <p className="mt-5 text-base font-semibold text-navy">{t.tagline}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button href={hrefs[0]}>{t.home.ctaPrimary}</Button>
              <Button href={hrefs[1]} variant="secondary">
                {t.home.ctaSecondary}
              </Button>
            </div>
          </div>

          {/* A real slice of the client portal, built from the same components. */}
          <div className="relative">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">
              {t.home.previewCaption}
            </p>
            <Card className="overflow-hidden shadow-raised">
              <div className="border-l-4 border-l-navy bg-surface px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-text">
                  {t.taxpayer.nextActionLabel}
                </p>
                <p className="mt-1.5 text-base font-semibold leading-snug text-fg">
                  {t.taxpayer.nextAction}
                </p>
              </div>
              <ul className="divide-y divide-border border-t border-border">
                {[
                  { label: locale === "fr" ? "Factures de ventes" : "Sales invoices", ok: true },
                  { label: locale === "fr" ? "Factures d'achats" : "Purchase invoices", ok: true },
                  { label: locale === "fr" ? "Relevé bancaire" : "Bank statement", ok: false },
                ].map((row) => (
                  <li key={row.label} className="flex items-center gap-3 px-5 py-2.5">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        row.ok
                          ? "border-teal-text bg-teal-text text-surface"
                          : "border-dashed border-amber-text/60"
                      }`}
                    >
                      {row.ok && (
                        <svg
                          viewBox="0 0 14 14"
                          className="h-3 w-3"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            d="M3.5 7.2 6 9.7l5-5.4"
                            fill="none"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 truncate text-sm text-fg">{row.label}</span>
                    <span className="text-xs font-semibold">
                      {row.ok ? (
                        <span className="text-teal-text">{t.taxpayer.received}</span>
                      ) : (
                        <span className="text-amber-text">{t.taxpayer.missing}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-sunken px-5 py-3">
                <Completeness received={2} total={3} />
                <StatusChip kind="awaitingReview" locale={locale} size="sm" />
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Proof — facts the product actually holds itself to, not borrowed logos. */}
      <section>
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          {t.home.proofTitle}
        </h2>
        <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {t.home.proof.map((p) => (
            <div key={p.label} className="bg-surface px-5 py-5">
              <dt className="tnum font-mono text-lg font-semibold text-navy">{p.value}</dt>
              <dd className="mt-1.5 text-sm leading-snug text-fg-muted">{p.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Path selection — a two-sided product should ask which side you are on. */}
      <section>
        <h2 className="mb-5 text-xl font-bold tracking-tight text-fg">{t.home.pathTitle}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {t.home.paths.map((p, i) => (
            <Card key={p.eyebrow} className="lift flex flex-col p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-text">
                {p.eyebrow}
              </p>
              <h3 className="mt-2 text-lg font-semibold leading-snug text-fg">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{p.body}</p>
              <div className="mt-5">
                <Button href={hrefs[i]} variant={i === 0 ? "primary" : "secondary"}>
                  {p.cta}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* The six product areas */}
      <section>
        <h2 className="mb-5 text-xl font-bold tracking-tight text-fg">{t.home.areasTitle}</h2>
        <div className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {t.home.areas.map((a, i) => (
            <div key={a.name} className="bg-surface px-5 py-5">
              <span className="tnum font-mono text-xs text-fg-subtle">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1.5 text-base font-semibold text-fg">{a.name}</h3>
              <p className="mt-1 text-sm leading-snug text-fg-muted">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pillars */}
      <section>
        <h2 className="mb-5 text-xl font-bold tracking-tight text-fg">{t.home.pillarsTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {t.home.pillars.map((p) => (
            <Card key={p.title} className="lift p-6">
              <h3 className="text-base font-semibold text-fg">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
