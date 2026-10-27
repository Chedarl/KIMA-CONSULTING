import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { BillingWorkspace } from "@/components/live/billing-workspace";

/** Kima's fees. The case fee dimension is shown and not written. */
export default function BillingPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const b = w.firm.billingPage;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h1 className="font-display text-lg font-semibold text-fg">{w.firm.nav.billing}</h1>
        <p className="text-sm text-fg-muted">{b.subtitle}</p>
      </div>
      <BillingWorkspace locale={locale} labels={b} />
    </div>
  );
}
