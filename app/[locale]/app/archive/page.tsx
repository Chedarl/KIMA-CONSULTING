import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Card, CardHeader, DemoBanner, EvidenceRef } from "@/components/ui";
import { obligations, pick } from "@/lib/demo-data";

/**
 * The evidence vault, grouped by year.
 *
 * A differentiator rather than a nice-to-have: the practitioner interview
 * found no structured archive at all, so retrieving a previous year's filing
 * is currently hard. Only obligations with filing evidence appear — the
 * archive holds proof, not assertions.
 */
export default function ArchivePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const c = getWorkspaceDictionary(locale).client;

  const filed = obligations.filter((o) => o.state.kind === "filed");
  const years = [...new Set(filed.map((o) => o.period.slice(0, 4)))].sort().reverse();

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{c.archiveTitle}</h2>
        <p className="text-sm text-fg-muted">{c.archiveSubtitle}</p>
      </div>

      {years.length === 0 ? (
        <Card className="px-5 py-8">
          <p className="text-sm text-fg-muted">{c.archiveEmpty}</p>
        </Card>
      ) : (
        years.map((year) => (
          <Card key={year}>
            <CardHeader title={year} />
            <ul className="divide-y divide-border">
              {filed
                .filter((o) => o.period.startsWith(year))
                .map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">{pick(o.label, locale)}</p>
                      <p className="tnum font-mono text-xs text-fg-subtle">{o.period}</p>
                    </div>
                    {o.state.kind === "filed" && (
                      <>
                        <EvidenceRef evidence={o.state.evidence} locale={locale} />
                        <span className="tnum font-mono text-xs text-fg-muted">
                          {o.state.evidence.capturedOn}
                        </span>
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
