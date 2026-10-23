import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { ClientArchive } from "@/components/live/client-records";

/**
 * The evidence vault, grouped by year.
 *
 * REBUILT AGAINST THE REAL RECORDS. Only cases whose filing is `verified`
 * AND carries an evidence reference appear — the archive holds proof, not
 * assertions, which is the same rule the database CHECK enforces. This page
 * used to filter invented `lib/demo-data` obligations.
 */
export default function ArchivePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <ClientArchive locale={locale} c={w.client} dash={w.clientDash} r={w.clientRecords} />
    </div>
  );
}
