import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { Client360 } from "@/components/live/client-360";

/** Client 360 — one taxpayer, the tables the firm already keeps. */
export default function ClientFilePage({
  params,
}: {
  params: { locale: string; taxpayerId: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <Client360
        taxpayerId={params.taxpayerId}
        locale={locale}
        t={w.client360}
        backHref={`/${locale}/workspace/clients`}
      />
    </div>
  );
}
