import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { ClientService } from "@/components/live/client-service";

/**
 * One service, in client language.
 *
 * Progress is `clientStatus()` — five states — not the firm's stage names
 * drawn on the handoff boards.
 */
export default function ClientServicePage({
  params,
}: {
  params: { locale: string; caseId: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <ClientService
        caseId={params.caseId}
        locale={locale}
        t={w.clientService}
        dash={w.clientDash}
        backHref={`/${locale}/app/declarations`}
      />
    </div>
  );
}
