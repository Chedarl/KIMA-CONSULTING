import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { KycPortal } from "@/components/live/kyc-portal";

/**
 * The KYC portal. RLS already confines every row to a KIMA administrator; the
 * screen adds nothing beyond what those policies grant, and the firm-verify
 * action goes through the audited admin_review_firm RPC rather than a table
 * write.
 */
export default function KycPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.firm.kyc.title}</h2>
        <p className="text-sm text-fg-muted">{w.firm.kyc.subtitle}</p>
      </div>
      <KycPortal t={w.firm.kyc} />
    </div>
  );
}
