import { notFound } from "next/navigation";
import Link from "next/link";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { FirmSettings } from "@/components/live/firm-settings";

export default function SettingsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.firm.settings.title}</h2>
        <p className="text-sm text-fg-muted">{w.firm.settings.subtitle}</p>
      </div>
      <FirmSettings t={w.firm.settings} staffHref={`/${locale}/workspace/staff`} />
      <div className="rounded-card border border-border bg-surface px-5 py-4">
        <h3 className="text-sm font-semibold text-fg">{w.firm.settings.staffTitle}</h3>
        <p className="mt-1 text-sm text-fg-muted">{w.firm.settings.staffHint}</p>
        <Link href={`/${locale}/workspace/staff`} className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">
          {w.firm.settings.staffLink}
        </Link>
      </div>
    </div>
  );
}
