import { notFound } from "next/navigation";
import Link from "next/link";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { EngagementsWorkspace } from "@/components/live/engagements-workspace";

/** Every engagement the firm holds. Client 360 remains the per-client view. */
export default function EngagementsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const e = w.firm.engagementsPage;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h1 className="font-display text-lg font-semibold text-fg">{w.firm.nav.engagements}</h1>
        <p className="text-sm text-fg-muted">{e.subtitle}</p>
      </div>
      <Link href={`/${locale}/workspace/invitations`} className="inline-flex min-h-[44px] items-center self-start rounded-lg border border-border px-4 text-sm font-semibold">
        {locale === "fr" ? "Voir les invitations" : "View invitations"}
      </Link>
      <EngagementsWorkspace locale={locale} labels={e} />
    </div>
  );
}
