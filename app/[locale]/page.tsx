import { getDictionary, isLocale } from "@/lib/i18n";
import { notFound } from "next/navigation";
import { Button, Card, DemoBanner } from "@/components/ui";

export default function OverviewPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);

  return (
    <div className="flex flex-col gap-8">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-text">
            {t.proposition}
          </p>
          <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight text-fg sm:text-4xl lg:text-5xl">
            {t.home.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-fg-muted">{t.home.heroBody}</p>
          <p className="mt-4 font-semibold text-navy">{t.tagline}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button href={`/${locale}/app`}>{t.home.ctaPrimary}</Button>
            <Button href={`/${locale}/workspace`} variant="secondary">
              {t.home.ctaSecondary}
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-border bg-navy px-5 py-4">
            <p className="text-sm font-semibold text-white">{t.brand}</p>
            <p className="mt-0.5 text-xs text-white/70">{t.company}</p>
          </div>
          <ul className="divide-y divide-border">
            {[
              { fr: "Kima Client", en: "Kima Client" },
              { fr: "Kima Workspace", en: "Kima Workspace" },
              { fr: "Kima DSF Bridge", en: "Kima DSF Bridge" },
              { fr: "Kima Compliance Radar", en: "Kima Compliance Radar" },
              { fr: "Kima Clarity AI", en: "Kima Clarity AI" },
              { fr: "Kima Evidence Vault", en: "Kima Evidence Vault" },
            ].map((area, i) => (
              <li key={area.en} className="flex items-center gap-3 px-5 py-3">
                <span className="tnum font-mono text-xs text-fg-subtle">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium text-fg">{area[locale]}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-fg">{t.home.pillarsTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {t.home.pillars.map((p) => (
            <Card key={p.title} className="p-5">
              <h3 className="text-base font-semibold text-fg">{p.title}</h3>
              <p className="mt-2 text-sm text-fg-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
