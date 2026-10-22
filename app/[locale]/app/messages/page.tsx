import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { ClientMessageThread } from "@/components/live/message-thread";

/** Secure messaging with the firm — the replacement for a scattered WhatsApp thread. */
export default function ClientMessagesPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const m = w.messaging;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{m.title}</h2>
        <p className="text-sm text-fg-muted">{m.subtitleClient}</p>
      </div>

      <ClientMessageThread
        locale={locale}
        senderName={w.client.title}
        labels={{
          placeholder: m.placeholder,
          send: m.send,
          sending: m.sending,
          sent: m.sent,
          failed: m.failed,
          you: m.you,
          firmName: m.firmName,
          aboutRequest: m.aboutRequest,
          noRequest: m.noRequest,
          empty: m.empty,
          tooLong: m.tooLong,
          demoIdentity: m.demoIdentity,
          connecting: t.work.connecting,
          offline: t.work.offline,
          live: t.work.live,
        }}
      />
    </div>
  );
}
