import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { IncidentList } from "@/components/live/incident-list";

export default function IncidentsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.firm.incidents.title}</h2>
        <p className="text-sm text-fg-muted">{w.firm.incidents.subtitle}</p>
      </div>
      <IncidentList t={w.firm.incidents} />
    </div>
  );
}
