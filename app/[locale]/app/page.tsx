import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { Button, Card, CardHeader, DemoBanner, StatusChip, Timeline } from "@/components/ui";
import { clientTimeline, documentRequests, obligations, pick } from "@/lib/demo-data";

/**
 * The taxpayer portal. Low density, plain language, mobile first.
 *
 * It shows exactly one next action, and it reads only the coarse
 * client-visible status — never the firm's internal workflow state.
 */
export default function TaxpayerHome({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);

  const missing = documentRequests.filter((d) => !d.received);

  return (
    <div className="flex flex-col gap-6">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t.taxpayer.greeting}</h1>
        <p className="mt-1 text-fg-muted">{t.taxpayer.entity}</p>
      </header>

      {/* One next action, stated as a sentence, with the reason it is needed. */}
      <Card className="border-l-4 border-l-navy p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-text">
          {t.taxpayer.nextActionLabel}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-fg">{t.taxpayer.nextAction}</h2>
        <p className="mt-2 max-w-xl text-sm text-fg-muted">{t.taxpayer.nextActionWhy}</p>
        <div className="mt-4">
          <Button href={`/${locale}/app`}>{t.taxpayer.nextActionCta}</Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title={t.taxpayer.documentsTitle}
            action={
              <span className="tnum font-mono text-xs text-fg-muted">
                {documentRequests.length - missing.length}/{documentRequests.length}
              </span>
            }
          />
          <ul className="divide-y divide-border">
            {documentRequests.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    d.received
                      ? "border-teal-text bg-teal-text text-surface"
                      : "border-dashed border-amber-text/60 text-amber-text"
                  }`}
                >
                  {d.received ? (
                    <svg
                      viewBox="0 0 14 14"
                      className="h-3.5 w-3.5"
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
                  ) : null}
                </span>
                <span className="flex-1 text-sm font-medium text-fg">{pick(d.label, locale)}</span>
                <span className="text-xs text-fg-subtle">
                  {d.responsible === "taxpayer"
                    ? t.taxpayer.responsibleYou
                    : t.taxpayer.responsibleFirm}
                </span>
                <span className="text-xs font-semibold">
                  {d.received ? (
                    <span className="text-teal-text">{t.taxpayer.received}</span>
                  ) : (
                    <span className="text-amber-text">{t.taxpayer.missing}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={t.taxpayer.progressTitle} />
            <div className="px-5 py-4">
              <Timeline
                steps={clientTimeline.map((s) => ({
                  label: pick(s.step, locale),
                  state: s.state,
                }))}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title={t.taxpayer.assignedTo} />
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-soft text-sm font-semibold text-navy">
                IM
              </span>
              <div>
                <p className="text-sm font-semibold text-fg">Irina Mbarga</p>
                <p className="text-xs text-fg-muted">Kima Consulting</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title={t.taxpayer.obligationsTitle} />
        <ul className="divide-y divide-border">
          {obligations.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{pick(o.label, locale)}</p>
                <p className="tnum font-mono text-xs text-fg-subtle">{o.period}</p>
              </div>
              <span className="text-xs text-fg-muted">
                {o.dueInDays >= 0
                  ? t.taxpayer.dueIn(o.dueInDays)
                  : t.taxpayer.overdueBy(Math.abs(o.dueInDays))}
              </span>
              <StatusChip kind={o.status} locale={locale} size="sm" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
