import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { getPublicCopy } from "@/lib/i18n-public";
import { PortalLogin } from "@/components/live/portal-login";

/**
 * Client sign-in. One-time code, not a password.
 * No site chrome: the screen is the navy panel plus the card.
 */
export default function LoginPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const w = getWorkspaceDictionary(locale);
  const copy = getPublicCopy(locale);

  return (
    <PortalLogin
      locale={locale}
      t={w.login}
      auth={copy.auth}
      portalHref={`/${locale}/app`}
    />
  );
}
