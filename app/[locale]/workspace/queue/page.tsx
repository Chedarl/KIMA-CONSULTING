import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { WorkQueue } from "@/components/live/work-queue";

/**
 * The work queue — the spine of the firm workspace.
 *
 * One case per obligation per period, ordered by risk rather than by date, so
 * the row to open first is the row at the top.
 */
export default function QueuePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.queue.title}</h2>
        <p className="text-sm text-fg-muted">{w.queue.subtitle}</p>
      </div>

      <WorkQueue locale={locale} t={w.queue} />
    </div>
  );
}
