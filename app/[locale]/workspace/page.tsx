import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { Card, CardHeader, Completeness, DemoBanner, Money, StatusChip } from "@/components/ui";
import { intakeQueue, pick, workspaceRows } from "@/lib/demo-data";

/**
 * The firm workspace. The opposite density to the client portal: a dense table,
 * tabular figures, as much useful information per screen as stays readable.
 */
export default function WorkspacePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);

  const awaiting = workspaceRows.filter((r) => r.status === "awaitingReview");
  const unbound = intakeQueue.filter((q) => !q.bound).length;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t.workspace.title}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">{t.workspace.subtitle}</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader title={t.workspace.clientsTitle} dense />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
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
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    {t.workspace.amount}
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
                    <td className="px-3 py-2 font-medium text-fg">{r.client}</td>
                    <td className="px-3 py-2 text-fg-muted">{pick(r.obligation, locale)}</td>
                    <td className="tnum px-3 py-2 font-mono text-xs text-fg-muted">{r.period}</td>
                    <td className="px-3 py-2">
                      <span className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                        {r.taxCentre}
                      </span>
                    </td>
                    <td className="tnum px-3 py-2 font-mono text-xs text-fg-muted">{r.due}</td>
                    <td className="px-3 py-2">
                      <Completeness received={r.docsReceived} total={r.docsTotal} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Money amount={r.amount} locale={locale} className="text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip kind={r.status} locale={locale} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          {/* Intake: upload links arrive bound; email-in arrives unbound and waits for a human. */}
          <Card>
            <CardHeader
              title={t.workspace.queueTitle}
              dense
              action={
                unbound > 0 ? (
                  <span className="rounded-full border border-dashed border-amber-text/40 bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber-text">
                    {unbound} {locale === "fr" ? "à rattacher" : "to bind"}
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
                      {q.arrivedAt}
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
                      {q.arrivedVia === "upload"
                        ? locale === "fr"
                          ? "lien"
                          : "link"
                        : locale === "fr"
                          ? "courriel"
                          : "email"}
                    </span>
                    <span className="truncate text-xs text-fg-muted">
                      {q.bound ? q.client : locale === "fr" ? "client inconnu" : "unknown client"}
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
