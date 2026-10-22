import { notFound } from "next/navigation";
import Link from "next/link";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { PortalLogin } from "@/components/live/portal-login";

/**
 * The client portal's front door.
 *
 * Two audiences, one form, labels that follow the person: a particulier signs in
 * with their name and NIU, a business with its registered name and its numéro
 * de contribuable. Deliberately the one page in the product with no navigation
 * shell — a visitor who is not signed in has nowhere to navigate to.
 */
export default function LoginPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-10 sm:px-6">
      <Link href={`/${locale}`} className="w-fit text-sm font-semibold text-navy hover:underline">
        Kima
      </Link>

      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <PortalLogin locale={locale} t={w.login} portalHref={`/${locale}/app`} />
    </main>
  );
}
