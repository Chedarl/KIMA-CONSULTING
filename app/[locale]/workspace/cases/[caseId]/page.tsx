import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { CaseDetail } from "@/components/live/case-detail";

/**
 * One case — screen 06.
 *
 * The route carries only the id and the dictionary. Everything else is read by
 * the client component from the same rows the queue, the dashboard and the
 * client portal read, because one set of records is the whole point.
 */
export default function CasePage({
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
      <CaseDetail
        caseId={params.caseId}
        locale={locale}
        t={w.caseDetail}
        queueHref={`/${locale}/workspace/queue`}
      />
    </div>
  );
}
