import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import {
  Button,
  Card,
  CardHeader,
  DemoBanner,
  DueBadge,
  EvidenceRef,
  StatusChip,
  Timeline,
} from "@/components/ui";
import {
  bucketOf,
  clientTimeline,
  demoAccountant,
  documentRequests,
  obligations,
  pick,
  requestIsOpen,
} from "@/lib/demo-data";

/**
 * The taxpayer portal. Low density, plain language, mobile first.
 *
 * Opens with My Day (after PwC Connect): only what needs action, bucketed into
 * overdue, due today and due within seven days. When nothing is open the
 * section says so rather than showing an empty list, because a quiet interface
 * is the point — colour and urgency appear only when they are earned.
 *
 * It reads only the coarse client-visible state, never the firm's internal
 * workflow.
 */
export default function TaxpayerHome({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);

  const open = documentRequests.filter((d) => requestIsOpen(d.status));
  const mine = open.filter((d) => d.responsible === "taxpayer");
  const buckets = [
    { key: "overdue" as const, items: mine.filter((d) => bucketOf(d.dueOn) === "overdue") },
    { key: "today" as const, items: mine.filter((d) => bucketOf(d.dueOn) === "today") },
    { key: "soon" as const, items: mine.filter((d) => bucketOf(d.dueOn) === "soon") },
  ].filter((b) => b.items.length > 0);

  const received = documentRequests.filter(
    (d) => d.status === "submitted" || d.status === "accepted",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t.taxpayer.greeting}</h1>
        <p className="mt-1 text-fg-muted">{t.taxpayer.entity}</p>
      </header>

      {/* My Day — the single most important thing on this screen. */}
      <Card className="border-l-4 border-l-navy p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-text">
          {t.work.myDay}
        </p>
        {buckets.length === 0 ? (
          <p className="mt-2 text-base text-fg-muted">{t.work.nothingDue}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {buckets.map((b) => (
              <div key={b.key}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  {t.work[b.key]}
                </p>
                <ul className="flex flex-col gap-2">
                  {b.items.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2.5">
                      <span className="flex-1 text-base font-medium text-fg">
                        {pick(d.label, locale)}
                      </span>
                      {d.returnedCount > 0 && (
                        <StatusChip kind="actionNeeded" locale={locale} size="sm" />
                      )}
                      <DueBadge dueOn={d.dueOn} locale={locale} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-sm text-fg-muted">{t.taxpayer.nextActionWhy}</p>
            <div>
              <Button href={`/${locale}/app`}>{t.taxpayer.nextActionCta}</Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title={t.taxpayer.documentsTitle}
            action={
              <span className="tnum font-mono text-xs text-fg-muted">
                {received}/{documentRequests.length}
              </span>
            }
          />
          <ul className="divide-y divide-border">
            {documentRequests.map((d) => {
              const done = d.status === "submitted" || d.status === "accepted";
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      done
                        ? "border-teal-text bg-teal-text text-surface"
                        : "border-dashed border-amber-text/60 text-amber-text"
                    }`}
                  >
                    {done && (
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
                    )}
                  </span>
                  <span className="flex-1 text-sm font-medium text-fg">
                    {pick(d.label, locale)}
                  </span>
                  <span className="text-xs text-fg-subtle">
                    {d.responsible === "taxpayer"
                      ? t.taxpayer.responsibleYou
                      : t.taxpayer.responsibleFirm}
                  </span>
                  <span className="text-xs font-semibold text-fg-muted">
                    {t.work.request[d.status]}
                  </span>
                </li>
              );
            })}
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
                {demoAccountant.initials}
              </span>
              <div>
                <p className="text-sm font-semibold text-fg">{demoAccountant.name}</p>
                <p className="text-xs text-fg-muted">{demoAccountant.firm}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title={t.taxpayer.obligationsTitle}
          action={<span className="text-[11px] text-fg-subtle">{t.work.demoDates}</span>}
        />
        <ul className="divide-y divide-border">
          {obligations.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{pick(o.label, locale)}</p>
                <p className="tnum font-mono text-xs text-fg-subtle">{o.period}</p>
              </div>
              {/* A filed obligation is never shown as overdue: its deadline
                  stopped applying the moment the evidence landed. */}
              <DueBadge dueOn={o.dueOn} locale={locale} settled={o.state.kind === "filed"} />
              <span className="flex flex-col items-end gap-1">
                <StatusChip kind={o.state.kind} locale={locale} size="sm" />
                {o.state.kind === "filed" && (
                  <EvidenceRef evidence={o.state.evidence} locale={locale} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
