import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { FirmDashboard } from "@/components/live/firm-dashboard";
import { IntakePanel } from "@/components/live/intake-panel";

/**
 * The firm command centre.
 *
 * It leads with work that needs attention rather than generic charts: an
 * accountant opening this screen is asking "what is at risk and what is
 * blocked", not "how did last quarter go".
 *
 * REBUILT AGAINST THE REAL RECORDS. This page used to render `lib/demo-data`,
 * a hand-written array of rows that looked like a practice but answered to
 * nothing. Every figure now comes from `compliance_cases`, `document_requests`,
 * `case_tasks` and `case_events` through the same engines the rest of the
 * product uses -- which is the design handoff's one non-negotiable rule: when
 * an accountant asks a client for a document, the same record drives the
 * client's portal, the firm's queue and this dashboard.
 *
 * The client-visible status on each row is computed with `clientStatus()`, so
 * what this screen says a client is being told is what the client is told.
 *
 * The intake panel stays: a client's upload lands there within the second, and
 * the accept/return decision travels straight back to their portal.
 */
export default function FirmOverview({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-6">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <FirmDashboard locale={locale} t={w.dashboard} queueHref={`/${locale}/workspace/queue`} />

      <IntakePanel
        locale={locale}
        labels={{
          incoming: t.work.incoming,
          accept: t.work.accept,
          returnIt: t.work.returnIt,
          accepted: t.work.accepted,
          returned: t.work.returned,
          live: t.work.live,
          connecting: t.work.connecting,
          offline: t.work.offline,
          empty: w.client.actionsEmpty,
        }}
      />
    </div>
  );
}
