import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Button, Card, Completeness, DemoBanner, StatusChip } from "@/components/ui";

/**
 * Public overview.
 *
 * Structure follows the "Trust & Authority + Conversion" pattern — hero with
 * mission and credibility, proof, solution, clear path — with the halo hero
 * and closing dark anchor taken from the Hirael reference.
 *
 * The reference's full-bleed autoplay video is deliberately not reproduced: it
 * would be the heaviest element on the page, and this product is for people on
 * slow connections (Scenario J). The halo is CSS, the marquee stops under
 * prefers-reduced-motion, and the hero still carries a working preview of the
 * product rather than a stock image.
 */
export default function OverviewPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const hrefs = [`/${locale}/app`, `/${locale}/workspace`];

  return (
    <div className="flex flex-col gap-14 pb-4">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      {/* Halo hero, with the reference's blurred shape accents drawn in CSS. */}
      <section className="aurora halo halo--ink rounded-card border border-border px-5 py-14 text-center sm:px-10 sm:py-20">
        <div className="halo__rings" aria-hidden="true" />
        <div className="shape shape--teal left-[-6rem] top-[-5rem] h-72 w-72" aria-hidden="true" />
        <div
          className="shape shape--navy bottom-[-7rem] right-[-7rem] h-96 w-96"
          aria-hidden="true"
        />
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#8fe3c4]">
          {t.proposition}
        </p>
        <h1 className="mx-auto max-w-4xl text-balance font-display text-3xl font-bold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
          {t.home.heroTitle}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-[#b9c7da]">
          {t.home.heroBody}
        </p>
        {/* The one gradient on the page, and it sits on the tagline rather than
            the headline: the tagline is a fixed canonical string, so the effect
            never forces translated copy to be split to fit it. */}
        <p className="text-gradient mt-6 font-display text-lg font-semibold sm:text-xl">
          {t.tagline}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href={hrefs[0]}>{t.home.ctaPrimary}</Button>
          <a
            href={hrefs[1]}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t.home.ctaSecondary}
          </a>
        </div>
        {/* The real front door for an existing client: name plus taxpayer
            number. Kept quieter than the two entrances above, which walk
            straight into the portals without signing in. */}
        {/* Two real doors, both proper tap targets. Applying comes first: a
            visitor who has never dealt with us cannot sign in to anything. */}
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <a
            href={`/${locale}/register`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 text-sm font-semibold text-white underline underline-offset-4 transition-colors hover:bg-white/10"
          >
            {getWorkspaceDictionary(locale).register.title}
          </a>
          <span className="text-white/40" aria-hidden="true">
            ·
          </span>
          <a
            href={`/${locale}/login`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 text-sm font-semibold text-white/85 underline underline-offset-4 transition-colors hover:bg-white/10 hover:text-white"
          >
            {getWorkspaceDictionary(locale).login.title}
          </a>
        </p>
      </section>

      {/* The six areas as a marquee — static and wrapped under reduced motion. */}
      <section aria-label={t.home.areasTitle}>
        <div className="marquee">
          <ul className="marquee__track">
            {[0, 1].map((copy) => (
              <li key={copy} className={copy === 1 ? "marquee__dup" : undefined} aria-hidden={copy === 1}>
                <ul className="flex items-center gap-10">
                  {t.home.areas.map((a) => (
                    <li
                      key={a.name}
                      className="whitespace-nowrap font-display text-sm font-semibold uppercase tracking-widest text-fg-subtle"
                    >
                      {a.name}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <hr className="hairline" aria-hidden="true" />

      {/* A real slice of the client portal, built from the same components. */}
      <section className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-fg">
            {t.home.pathTitle}
          </h2>
          <div className="mt-5 flex flex-col gap-4">
            {t.home.paths.map((p, i) => (
              <Card key={p.eyebrow} className="spotlight lift flex flex-col p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-text">
                  {p.eyebrow}
                </p>
                <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug text-fg">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.body}</p>
                <div className="mt-4">
                  <Button href={hrefs[i]} variant={i === 0 ? "primary" : "secondary"}>
                    {p.cta}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div>
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
                      <svg viewBox="0 0 14 14" className="h-3 w-3" stroke="currentColor" aria-hidden="true">
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
              <Completeness received={2} total={3} locale={locale} />
              <StatusChip kind="awaitingReview" locale={locale} size="sm" />
            </div>
          </Card>
        </div>
      </section>

      {/* Proof — facts the product holds itself to, not borrowed logos. */}
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

      {/* The six product areas */}
      <section>
        <h2 className="mb-5 font-display text-xl font-bold tracking-tight text-fg">
          {t.home.areasTitle}
        </h2>
        {/* The reference's six-item feature grid: each tile lit from its top
            edge, the index in tabular figures so the column of them aligns. */}
        <ul className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {t.home.areas.map((a, i) => (
            <li key={a.name} className="spotlight lift bg-surface px-5 py-6">
              <span className="step-index font-mono text-xs font-semibold text-teal-text">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-display text-base font-semibold text-fg">{a.name}</h3>
              <p className="mt-1.5 text-sm leading-snug text-fg-muted">{a.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Pillars */}
      <section>
        <h2 className="mb-5 font-display text-xl font-bold tracking-tight text-fg">
          {t.home.pillarsTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {t.home.pillars.map((p) => (
            <Card key={p.title} className="spotlight lift p-6">
              <h3 className="font-display text-base font-semibold text-fg">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Dark anchor close. The reference repeats both hero buttons here; so do
          we, because the visitor who reaches the bottom has read the argument
          and should not have to scroll back up to act on it. */}
      <section className="aurora halo halo--ink rounded-card border border-border px-6 py-14 text-center">
        <div className="halo__rings" aria-hidden="true" />
        <div
          className="shape shape--teal bottom-[-5rem] left-1/2 h-64 w-64 -translate-x-1/2"
          aria-hidden="true"
        />
        <p className="mx-auto max-w-2xl font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {t.tagline}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button href={hrefs[0]}>{t.home.ctaPrimary}</Button>
          <a
            href={hrefs[1]}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t.home.ctaSecondary}
          </a>
        </div>
      </section>
    </div>
  );
}
