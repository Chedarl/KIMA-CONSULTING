import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Card, CardHeader, DemoBanner, DueBadge, EvidenceRef, StatusChip } from "@/components/ui";
import { obligations, pick, taxProfile } from "@/lib/demo-data";

/** The client's bird's-eye view: who they are to the tax administration, and what they owe. */
export default function CompliancePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const c = getWorkspaceDictionary(locale).client;

  const rows: { label: string; value: string; unverified?: boolean }[] = [
    { label: c.niu, value: taxProfile.niu },
    { label: c.regime, value: pick(taxProfile.regime, locale), unverified: !taxProfile.verified },
    {
      label: c.framework,
      value: pick(taxProfile.framework, locale),
      unverified: !taxProfile.verified,
    },
    { label: c.centre, value: taxProfile.centre },
  ];

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{c.complianceTitle}</h2>
        <p className="text-sm text-fg-muted">{c.complianceSubtitle}</p>
      </div>

      <Card>
        <CardHeader title={c.profileTitle} />
        <dl className="grid gap-px bg-border sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="bg-surface px-5 py-3">
              <dt className="text-xs uppercase tracking-wide text-fg-subtle">{r.label}</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                <span className="tnum font-mono">{r.value}</span>
                {/* Tax classification is confirmed against current rules, never
                    assumed — so an unverified profile says so on its face. */}
                {r.unverified && (
                  <span className="rounded-full border border-dashed border-amber-text/40 bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber-text">
                    {c.unverified}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={t.taxpayer.obligationsTitle} />
        <ul className="divide-y divide-border">
          {obligations.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{pick(o.label, locale)}</p>
                <p className="tnum font-mono text-xs text-fg-subtle">{o.period}</p>
              </div>
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
