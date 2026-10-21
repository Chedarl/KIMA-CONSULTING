import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { DocumentsPanel } from "@/components/live/documents-panel";

/**
 * The document centre.
 *
 * The list is a live client component over Supabase, not a rendering of a
 * static array: uploads persist, the request status actually changes, and the
 * firm sees it without refreshing. Labels are passed down so the dictionary
 * never reaches the browser bundle.
 */
export default function DocumentsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const c = getWorkspaceDictionary(locale).client;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{c.documentsTitle}</h2>
        <p className="text-sm text-fg-muted">{c.documentsSubtitle}</p>
      </div>

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
        }}
      />
    </div>
  );
}
