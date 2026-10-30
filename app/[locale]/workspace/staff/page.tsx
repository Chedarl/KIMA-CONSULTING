import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { StaffWorkspace } from "@/components/live/staff-workspace";

/** Phase 2 item 2: the people in the firm, and who may change that list. */
export default function StaffPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const s = w.firm.staffPage;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h1 className="font-display text-lg font-semibold text-fg">{w.firm.nav.staff}</h1>
        <p className="text-sm text-fg-muted">{s.subtitle}</p>
      </div>
      <StaffWorkspace labels={s} />
    </div>
  );
}
