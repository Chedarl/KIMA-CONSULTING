import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { InboxWorkspace } from "@/components/live/inbox-workspace";

/** Every document that arrived, across every client, with bulk review and file operations. */
export default function InboxPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const i = w.firm.inbox;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.firm.nav.inbox}</h2>
        <p className="text-sm text-fg-muted">{i.subtitle}</p>
      </div>

      <InboxWorkspace
        locale={locale}
        verdicts={w.verdicts}
        labels={{
          allClients: i.allClients,
          allStatuses: i.allStatuses,
          status: {
            pending: i.statusPending,
            accepted: i.statusAccepted,
            returned: i.statusReturned,
          },
          selected: i.selected,
          acceptSelected: i.acceptSelected,
          returnSelected: i.returnSelected,
          returnReason: i.returnReason,
          returnReasonPh: i.returnReasonPh,
          confirm: i.confirm,
          cancel: i.cancel,
          preview: i.preview,
          copyTo: i.copyTo,
          copied: i.copied,
          rename: i.rename,
          renamed: i.renamed,
          newName: i.newName,
          accepted: t.work.accepted,
          returned: t.work.returned,
          failed: w.firm.checks.failed,
          partial: i.partial,
          empty: i.empty,
          unbound: i.unbound,
          latest: i.latest,
          connecting: t.work.connecting,
          offline: t.work.offline,
          live: t.work.live,
          verdictsRecorded: i.verdictsRecorded,
          verdictsRequired: i.verdictsRequired,
          awaitingVerdicts: i.awaitingVerdicts,
          signInRequired: i.signInRequired,
        }}
      />
    </div>
  );
}
