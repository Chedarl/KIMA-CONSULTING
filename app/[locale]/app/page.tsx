import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { ClientDashboard } from "@/components/live/client-dashboard";

/**
 * The client dashboard — a compliance control centre, not an accounting tool.
 *
 * It answers, in order: what do you need from me, what is due, where are my
 * services, and what has happened. Everything below that is reassurance and
 * record-keeping.
 *
 * REBUILT AGAINST THE REAL RECORDS, and interactive. This page used to render
 * `lib/demo-data`; it now reads the same rows the firm workspace reads, and
 * sending a document writes to them. A client's action lands in the
 * accountant's queue without anyone re-keying it, which is the whole point of
 * having one set of records.
 *
 * The compliance status is derived from the data, never asserted: a hardcoded
 * "up to date" would be the most damaging possible lie in this product.
 */
export default function ClientPortalHome({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-6">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <ClientDashboard
        locale={locale}
        t={w.clientDash}
        fallbackName={w.client.title}
        documentsHref={`/${locale}/app/documents`}
      />
    </div>
  );
}
