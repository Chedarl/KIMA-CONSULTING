import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { DsfImport } from "@/components/live/dsf-import";

export default function DsfPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.firm.dsf.title}</h2>
        <p className="text-sm text-fg-muted">{w.firm.dsf.subtitle}</p>
      </div>
      <DsfImport t={w.firm.dsf} />
    </div>
  );
}
