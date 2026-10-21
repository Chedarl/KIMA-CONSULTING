import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { ReviewsPanel } from "@/components/live/reviews-panel";

/** Reviews and approvals, gated by the pre-approval diagnostics. */
export default function ReviewsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const k = w.firm.checks;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{k.title}</h2>
        <p className="max-w-2xl text-sm text-fg-muted">{k.intro}</p>
      </div>

      <ReviewsPanel
        locale={locale}
        labels={{
          blocking: k.blocking,
          advisory: k.advisory,
          clean: k.clean,
          approve: k.approve,
          approveBlocked: k.approveBlocked,
          approved: k.approved,
          recordEvidence: k.recordEvidence,
          evidencePlaceholder: k.evidencePlaceholder,
          filed: k.filed,
          evidenceRequired: k.evidenceRequired,
          preparedBy: k.preparedBy,
          reviewer: k.reviewer,
          none: k.none,
          failed: k.failed,
          empty: w.client.actionsEmpty,
          offline: t.work.offline,
        }}
      />
    </div>
  );
}
