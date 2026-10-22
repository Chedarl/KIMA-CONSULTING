import { notFound } from "next/navigation";
import Link from "next/link";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { FirmLogin } from "@/components/live/firm-login";

export default function FirmLoginPage({ params }: { params: { locale: string } }) {
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
      <FirmLogin locale={locale} t={w.firmLogin} workspaceHref={`/${locale}/workspace`} />
    </main>
  );
}
