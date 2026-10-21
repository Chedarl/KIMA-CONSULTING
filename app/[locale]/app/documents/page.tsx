import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Button, Card, CardHeader, DemoBanner, DueBadge } from "@/components/ui";
import { documentRequests, pick, requestIsOpen } from "@/lib/demo-data";

/**
 * The document centre. Document collection is the biggest operational pain, so
 * the missing checklist sits beside the list rather than buried inside it.
 */
export default function DocumentsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const c = w.client;

  const missing = documentRequests.filter(
    (d) => requestIsOpen(d.status) && d.responsible === "taxpayer",
  );

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-fg">{c.documentsTitle}</h2>
          <p className="text-sm text-fg-muted">{c.documentsSubtitle}</p>
        </div>
        <Button href={`/${locale}/app/documents`}>{c.upload}</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader title={c.documentsTitle} dense />
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={c.documentsTitle}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{c.documentsTitle}</caption>
              <thead>
                <tr className="border-b border-border bg-surface-sunken text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.taxpayer.documentsTitle}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.due}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t.workspace.status}
                  </th>
                </tr>
              </thead>
              <tbody>
                {documentRequests.map((d) => {
                  const done = d.status === "submitted" || d.status === "accepted";
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <th scope="row" className="px-3 py-2.5 text-left font-medium text-fg">
                        {pick(d.label, locale)}
                        <span className="ml-2 text-xs font-normal text-fg-subtle">
                          {d.responsible === "taxpayer"
                            ? t.taxpayer.responsibleYou
                            : t.taxpayer.responsibleFirm}
                        </span>
                      </th>
                      <td className="px-3 py-2.5">
                        <DueBadge dueOn={d.dueOn} locale={locale} settled={done} />
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            done
                              ? "bg-teal-soft text-teal-text"
                              : d.status === "returned"
                                ? "bg-danger-soft text-danger-text"
                                : "bg-surface-sunken text-fg-muted"
                          }`}
                        >
                          {t.work.request[d.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title={c.missingChecklist} dense />
          {missing.length === 0 ? (
            <p className="px-4 py-5 text-sm text-fg-muted">{c.actionsEmpty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {missing.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-amber-text/60" />
                  <span className="flex-1 text-sm text-fg">{pick(d.label, locale)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-4 py-3">
            <Button href={`/${locale}/app/documents`}>{c.uploadNow}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
