import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DocumentsPanel } from "@/components/live/documents-panel";

/** Document inbox. Received and accepted stay different statuses. */
export default function DocumentsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const desk = w.requestDesk;

  return (
    <DocumentsPanel
      locale={locale}
      labels={{
        empty: t.work.allDone,
        dropHere: t.work.dropHere,
        dropHint: t.work.dropHint,
        uploading: t.work.uploading,
        uploaded: t.work.uploadedOk,
        failed: t.work.uploadFailed,
        withYou: t.taxpayer.responsibleYou,
        withFirm: t.taxpayer.responsibleFirm,
        due: t.workspace.due,
        status: t.work.request,
        connecting: t.work.connecting,
        offline: t.work.offline,
        live: t.work.live,
        all: desk.all,
        overdue: desk.overdue,
        today: desk.today,
        soon: desk.soon,
        waiting: desk.waiting,
        received: desk.received,
        accepted: desk.accepted,
        receivedNotAccepted: desk.receivedNotAccepted,
        noMatch: desk.empty,
        forService: desk.forService,
        returnedTimes: desk.returnedTimes,
      }}
    />
  );
}
