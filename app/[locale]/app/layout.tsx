import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPortalDictionary } from "@/lib/i18n-portal";
import { PortalCopyProvider } from "@/components/client-portal/copy";
import { ClientPortalShell } from "@/components/client-portal/shell";

/**
 * Client portal chrome. Firm workspace keeps components/shell.tsx.
 * Copy is passed in for one language so the client bundle does not ship both.
 */
export default function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const copy = getPortalDictionary(locale);

  return (
    <PortalCopyProvider copy={copy}>
      <ClientPortalShell locale={locale}>{children}</ClientPortalShell>
    </PortalCopyProvider>
  );
}
