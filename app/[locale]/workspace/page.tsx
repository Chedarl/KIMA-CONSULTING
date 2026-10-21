import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
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
  formatTime,
  intakeQueue,
  pick,
  workspaceMetrics,
  workspaceRows,
} from "@/lib/demo-data";

/**
 * The firm workspace, built on the request model in
 * docs/foundation/portal-patterns-research.md.
 *
 * Dense by design — the opposite of the client portal. The metrics strip takes
 * PwC Connect's three request metrics; "returned more than once" is there
 * because rework measures our own clarity, not the client's diligence.
 *
 * There is deliberately no amount column: this prototype computes no tax
 * figures, and a number in a "Montant" column would read as one.
 */
export default function WorkspacePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);

  const m = workspaceMetrics();
  const awaiting = workspaceRows.filter((r) => r.state.kind === "awaitingReview");
  const unbound = intakeQueue.filter((q) => q.client === null).length;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t.workspace.title}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          {m.clients} {t.work.metrics.clients.toLowerCase()} · {m.atRisk} {t.work.metrics.atRisk.toLowerCase()}
        </p>
      </header>

      {/* The three request metrics, computed from the rows rather than asserted. */}
      <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          value={String(m.atRisk)}
          label={t.work.metrics.atRisk}
          tone={m.atRisk > 0 ? "warn" : "neutral"}
        />
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
        <Card className="overflow-hidden">
          <CardHeader
            title={t.workspace.clientsTitle}
            dense
            action={
              <span className="text-[11px] text-fg-subtle">{t.work.demoDates}</span>
            }
          />
          {/* Keyboard-reachable scroll region with an accessible name. */}
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={t.workspace.clientsTitle}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.workspace.clientsTitle}</caption>
              <thead>
                <tr className="border-b border-border bg-surface-sunken text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.client}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.obligation}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.period}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.taxCentre}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.due}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.completeness}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.status}
                  </th>
                </tr>
              </thead>
              <tbody>
                {workspaceRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-surface-sunken"
                  >
                    <th scope="row" className="px-3 py-2 text-left font-medium text-fg">
                      {r.client}{" "}
                      {r.mine && (
                        <span className="ml-1.5 rounded bg-navy-soft px-1 py-0.5 text-[10px] font-semibold text-navy">
                          {t.work.mine}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-2 text-fg-muted">{pick(r.obligation, locale)}</td>
                    <td className="tnum px-3 py-2 font-mono text-xs text-fg-muted">{r.period}</td>
                    <td className="px-3 py-2">
                      <abbr
                        title={r.taxCentre}
                        className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-muted no-underline"
                      >
                        {r.taxCentre}
                      </abbr>
                    </td>
                    <td className="px-3 py-2">
                      <DueBadge
                        dueOn={r.dueOn}
                        locale={locale}
                        settled={r.state.kind === "filed"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Completeness received={r.docsReceived} total={r.docsTotal} />
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

        <div className="flex flex-col gap-5">
          {/* Intake: upload links arrive bound; email-in waits for a human. */}
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

          {/* The review gate, and why a solo practitioner can still satisfy it. */}
          <Card>
            <CardHeader title={t.workspace.reviewTitle} dense />
            <div className="flex flex-col gap-3 px-3 py-3">
              {awaiting.map((r) => (
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
              ))}
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
