import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { WorkQueue } from "@/components/live/work-queue";

/**
 * Compliance cases — the same open cases as the work queue, reached as the
 * case register. Ordering and blockers still come from `lib/cases`.
 */
export default function CasesPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h1 className="font-display text-lg font-semibold text-fg">{w.firm.nav.cases}</h1>
        <p className="text-sm text-fg-muted">{w.queue.subtitle}</p>
      </div>
      <WorkQueue locale={locale} t={w.queue} />
    </div>
  );
}
