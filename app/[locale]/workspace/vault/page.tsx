import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { VaultWorkspace } from "@/components/live/vault-workspace";

/** Accepted documents and verified filing evidence. The inbox is the other door. */
export default function VaultPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const v = w.firm.vaultPage;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h1 className="font-display text-lg font-semibold text-fg">{w.firm.nav.vault}</h1>
        <p className="text-sm text-fg-muted">{v.subtitle}</p>
      </div>
      <VaultWorkspace locale={locale} labels={v} />
    </div>
  );
}
