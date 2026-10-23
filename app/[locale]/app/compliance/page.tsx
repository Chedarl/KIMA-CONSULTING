import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { ClientCompliance } from "@/components/live/client-records";

/**
 * The client's bird's-eye view: who they are to the tax administration, and
 * what they owe — read from `taxpayers` and `compliance_cases`.
 *
 * REBUILT AGAINST THE REAL RECORDS. This page used to render `lib/demo-data`
 * (an invented profile and invented obligations) while `lib/rules` and the
 * case engine sat unused. The four axes are shown on separate rows and never
 * collapsed; an unverified profile says so on its face.
 */
export default function CompliancePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <ClientCompliance locale={locale} c={w.client} dash={w.clientDash} r={w.clientRecords} />
    </div>
  );
}
