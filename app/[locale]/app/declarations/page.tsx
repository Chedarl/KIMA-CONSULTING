import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  Card,
  CardHeader,
  DemoBanner,
  DueBadge,
  EvidenceRef,
  StatusChip,
  Timeline,
} from "@/components/ui";
import { clientTimeline, obligations, pick } from "@/lib/demo-data";

/**
 * What Kima has prepared, is preparing, or has filed.
 *
 * Each declaration carries its own progress steps, so "where is my
 * declaration" is answered on screen rather than by telephone. A filed one
 * shows the evidence that makes it filed; without that it would be a claim.
 */
export default function DeclarationsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const c = getWorkspaceDictionary(locale).client;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{c.declarationsTitle}</h2>
        <p className="text-sm text-fg-muted">{c.declarationsSubtitle}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {obligations.map((o) => {
          const filed = o.state.kind === "filed";
          // Illustrative of this demo declaration's progress; a real one
          // derives its steps from the case record.
          const steps = clientTimeline.map((s, i) => ({
            label: pick(s.step, locale),
            state: filed
              ? ("done" as const)
              : i === 0
                ? ("done" as const)
                : i === 1
                  ? ("current" as const)
                  : ("todo" as const),
          }));

          return (
            <Card key={o.id} className="flex flex-col">
              <CardHeader
                title={`${pick(o.label, locale)} — ${o.period}`}
                action={<StatusChip kind={o.state.kind} locale={locale} size="sm" />}
              />
              <div className="flex flex-1 flex-col gap-4 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <DueBadge dueOn={o.dueOn} locale={locale} settled={filed} />
                  {o.state.kind === "filed" && (
                    <EvidenceRef evidence={o.state.evidence} locale={locale} />
                  )}
                </div>
                <Timeline steps={steps} />
                <p className="mt-auto rounded-lg border border-border bg-surface-sunken px-3 py-2 text-xs text-fg-muted">
                  <span className="font-semibold text-fg">{c.notes}: </span>
                  {c.noNotes}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
