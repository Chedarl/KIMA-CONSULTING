import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { ClientDeclarations } from "@/components/live/client-records";

/**
 * What Kima has prepared, is preparing, or has filed — one card per
 * `compliance_cases` row, progress in the client's five states, history from
 * `case_events` (client-visible kinds only).
 *
 * REBUILT AGAINST THE REAL RECORDS. This page used to render `lib/demo-data`
 * with an illustrative timeline; steps now derive from the case record via
 * `clientStatus()`, and a filing shows its evidence reference or says the
 * proof is still pending — never a bare claim of "filed".
 */
export default function DeclarationsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <ClientDeclarations locale={locale} c={w.client} dash={w.clientDash} r={w.clientRecords} />
    </div>
  );
}
