import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getPortalDictionary } from "@/lib/i18n-portal";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { ClientMessageThread } from "@/components/live/message-thread";

/** One thread with the firm, grouped by the request a message is about. */
export default function ClientMessagesPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const copy = getPortalDictionary(locale);
  const m = w.messaging;

  return (
    <ClientMessageThread
      locale={locale}
      senderName={w.client.title}
      appearance="portal"
      heading={copy.messagesTitle}
      labels={{
        placeholder: copy.typeMessage,
        send: copy.send,
        sending: m.sending,
        sent: m.sent,
        failed: m.failed,
        you: m.you,
        firmName: copy.kimaTeam,
        aboutRequest: m.aboutRequest,
        noRequest: copy.generalThread,
        empty: copy.noMessages,
        tooLong: m.tooLong,
        demoIdentity: m.demoIdentity,
        connecting: t.work.connecting,
        offline: t.work.offline,
        live: t.work.live,
      }}
    />
  );
}
