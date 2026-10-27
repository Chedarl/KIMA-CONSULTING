import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { ClientDashboard } from "@/components/live/client-dashboard";

/** Client home. Counts and the action card come from the same rows as the firm. */
export default function ClientPortalHome({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const w = getWorkspaceDictionary(locale);

  return (
    <ClientDashboard
      locale={locale}
      t={w.clientDash}
      fallbackName={w.client.title}
      documentsHref={`/${locale}/app/documents`}
    />
  );
}
