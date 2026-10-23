import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { LeadsWorkspace } from "@/components/live/leads-workspace";

/** Intake triage. Statuses come from `lib/registration`, not a sales pipeline. */
export default function LeadsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h1 className="font-display text-lg font-semibold text-fg">{w.leads.title}</h1>
        <p className="text-sm text-fg-muted">{w.leads.subtitle}</p>
      </div>
      <LeadsWorkspace locale={locale} t={w.leads} />
    </div>
  );
}
