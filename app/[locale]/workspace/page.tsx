import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  Card,
  CardHeader,
  Completeness,
  DemoBanner,
  DueBadge,
  EvidenceRef,
  Metric,
  StatusChip,
} from "@/components/ui";
import {
  bucketOf,
  daysUntil,
  formatTime,
  intakeQueue,
  pick,
  workspaceMetrics,
  workspaceRows,
  type WorkspaceRow,
} from "@/lib/demo-data";

/**
 * The firm command centre.
 *
 * It leads with work that needs attention rather than generic charts: an
 * accountant opening this screen is asking "what is at risk and what is
 * blocked", not "how did last quarter go".
 *
 * The routine/DSF switch is a pair of links with a query parameter rather than
 * client state — no JavaScript needed to change view, which matters on a slow
 * connection.
 */
export default function FirmOverview({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: { view?: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const f = w.firm;

  const view = searchParams?.view === "dsf" ? "dsf" : "routine";
  const isDsf = (r: WorkspaceRow) => r.obligation.en.toUpperCase().includes("DSF");
  const rows = workspaceRows.filter((r) => (view === "dsf" ? isDsf(r) : !isDsf(r)));

  const m = workspaceMetrics(rows);
  const awaitingClients = rows.filter((r) => r.state.kind === "actionNeeded").length;
  const reviewQueue = rows.filter((r) => r.state.kind === "awaitingReview");
  const active = rows.filter((r) => r.state.kind !== "filed").length;
  const unbound = intakeQueue.filter((q) => q.client === null).length;

  // What to do next, derived from the state rather than stored as a label.
  const nextStepFor = (r: WorkspaceRow) =>
    r.state.kind === "actionNeeded"
      ? f.requestStatement
      : r.state.kind === "awaitingReview"
        ? f.finalReview
        : f.reviewTransactions;

  const attention = rows
    .filter((r) => r.state.kind !== "filed")
    .sort((a, b) => daysUntil(a.dueOn) - daysUntil(b.dueOn))
    .slice(0, 4);

  const tab = (key: "routine" | "dsf", label: string) => (
    <a
      key={key}
      href={`/${locale}/workspace${key === "dsf" ? "?view=dsf" : ""}`}
      aria-current={view === key ? "page" : undefined}
      className={`inline-flex min-h-[44px] items-center rounded-rail px-3 text-sm transition-colors ${
        view === key
          ? "bg-navy font-semibold text-surface"
          : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
      }`}
    >
      {label}
    </a>
  );

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div
        className="flex flex-wrap gap-1 rounded-rail border border-border bg-surface p-1"
        role="group"
        aria-label={t.work.viewLabel}
      >
        {tab("routine", f.tabRoutine)}
        {tab("dsf", f.tabDsf)}
      </div>

      {/* Four counts of work, then the three request metrics behind them. */}
      <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric value={String(active).padStart(2, "0")} label={f.cards.activeCases} hint={f.cards.activeCasesSub} />
        <Metric
          value={String(awaitingClients).padStart(2, "0")}
          label={f.cards.awaitingClients}
          hint={f.cards.awaitingClientsSub}
          tone={awaitingClients > 0 ? "warn" : "neutral"}
        />
        <Metric
          value={String(reviewQueue.length).padStart(2, "0")}
          label={f.cards.reviewQueue}
          hint={f.cards.reviewQueueSub}
        />
        <Metric
          value={String(m.atRisk).padStart(2, "0")}
          label={f.cards.deadlineRisks}
          hint={f.cards.deadlineRisksSub}
          tone={m.atRisk > 0 ? "warn" : "neutral"}
        />
      </dl>

      <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3">
        <Metric
          value={`${m.averageDaysOverdue}${t.work.metrics.days}`}
          label={t.work.metrics.avgOverdue}
          tone={m.averageDaysOverdue > 0 ? "warn" : "neutral"}
        />
        <Metric
          value={m.onTimePct === null ? "—" : `${m.onTimePct}%`}
          label={t.work.metrics.onTime}
        />
        <Metric
          value={String(m.returnedMoreThanOnce)}
          label={t.work.metrics.returnedTwice}
          hint={t.work.metrics.returnedHint}
          tone={m.returnedMoreThanOnce > 0 ? "warn" : "neutral"}
        />
      </dl>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {/* Cases requiring attention — soonest deadline first. */}
          <Card>
            <CardHeader title={f.attentionTitle} dense />
            {attention.length === 0 ? (
              <p className="px-4 py-6 text-sm text-fg-muted">{w.client.actionsEmpty}</p>
            ) : (
              <ul className="divide-y divide-border">
                {attention.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">{r.client}</p>
                      <p className="text-xs text-fg-muted">
                        {pick(r.obligation, locale)} · <span className="tnum font-mono">{r.period}</span>
                      </p>
                    </div>
                    <StatusChip kind={r.state.kind} locale={locale} size="sm" />
                    <DueBadge dueOn={r.dueOn} locale={locale} />
                    <span className="w-full text-xs text-fg-subtle sm:w-auto">
                      <span className="font-medium text-fg-muted">{f.nextStep}: </span>
                      {nextStepFor(r)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title={t.workspace.clientsTitle}
              dense
              action={<span className="text-[11px] text-fg-subtle">{t.work.demoDates}</span>}
            />
            <div
              className="overflow-x-auto focus-visible:outline-offset-[-3px]"
              tabIndex={0}
              role="region"
              aria-label={t.workspace.clientsTitle}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{t.workspace.clientsTitle}</caption>
                <thead>
                  <tr className="border-b border-border bg-surface-sunken text-xs uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="px-3 py-2 font-semibold">{t.workspace.client}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{t.workspace.period}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{t.workspace.taxCentre}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{t.workspace.due}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{t.workspace.completeness}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{t.workspace.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-sunken">
                      <th scope="row" className="px-3 py-2 text-left font-medium text-fg">
                        {r.client}{" "}
                        {r.mine && (
                          <span className="rounded bg-navy-soft px-1 py-0.5 text-[10px] font-semibold text-navy">
                            {t.work.mine}
                          </span>
                        )}
                      </th>
                      <td className="tnum px-3 py-2 font-mono text-xs text-fg-muted">{r.period}</td>
                      <td className="px-3 py-2">
                        <span className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-muted no-underline">{r.taxCentre}</span>
                      </td>
                      <td className="px-3 py-2">
                        <DueBadge dueOn={r.dueOn} locale={locale} settled={r.state.kind === "filed"} />
                      </td>
                      <td className="px-3 py-2">
                        <Completeness received={r.docsReceived} total={r.docsTotal} locale={locale} />
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col items-start gap-1">
                          <StatusChip kind={r.state.kind} locale={locale} size="sm" />
                          {r.state.kind === "filed" && (
                            <EvidenceRef evidence={r.state.evidence} locale={locale} />
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title={t.workspace.queueTitle}
              dense
              action={
                unbound > 0 ? (
                  <span className="rounded-full border border-dashed border-amber-text/40 bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber-text">
                    {unbound} {t.work.unbound}
                  </span>
                ) : undefined
              }
            />
            <ul className="divide-y divide-border">
              {intakeQueue.map((q) => (
                <li key={q.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs text-fg">{q.file}</span>
                    <span className="tnum shrink-0 font-mono text-[11px] text-fg-subtle">
                      {formatTime(q.arrivedAt, locale)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        q.arrivedVia === "upload"
                          ? "bg-teal-soft text-teal-text"
                          : "bg-surface-sunken text-fg-muted"
                      }`}
                    >
                      {q.arrivedVia === "upload" ? t.work.viaLink : t.work.viaEmail}
                    </span>
                    <span className="truncate text-xs text-fg-muted">
                      {q.client ?? t.work.unknownClient}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t.workspace.reviewTitle} dense />
            <div className="flex flex-col gap-3 px-3 py-3">
              {reviewQueue.length === 0 ? (
                <p className="text-xs text-fg-muted">{w.client.actionsEmpty}</p>
              ) : (
                reviewQueue.map((r) => (
                  <div key={r.id}>
                    <p className="text-sm font-semibold text-fg">{r.client}</p>
                    <p className="tnum font-mono text-xs text-fg-muted">{r.period}</p>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-fg-subtle">{t.workspace.preparedBy}</dt>
                      <dd className="text-fg">{r.preparedBy}</dd>
                      <dt className="text-fg-subtle">{t.workspace.reviewer}</dt>
                      <dd className="text-fg">
                        {r.reviewer}
                        {r.reviewerIsPool && (
                          <span className="ml-1.5 rounded bg-navy-soft px-1.5 py-0.5 text-[10px] font-semibold text-navy">
                            {t.workspace.poolReviewer}
                          </span>
                        )}
                      </dd>
                    </dl>
                  </div>
                ))
              )}
              <p className="rounded-lg border border-border bg-surface-sunken px-3 py-2 text-xs text-fg-muted">
                {t.workspace.noSelfApproval}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
