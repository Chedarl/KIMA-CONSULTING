import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { ClientArchive } from "@/components/live/client-records";

/** Same vault as /records, kept so older links still open accepted evidence. */
export default function ArchivePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const w = getWorkspaceDictionary(locale);
  return <ClientArchive locale={locale} c={w.client} dash={w.clientDash} r={w.clientRecords} />;
}
