"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audit, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import type { ActorRole } from "@/lib/events";

/**
 * A two-sided message thread, live on both sides.
 *
 * This is the replacement for the scattered WhatsApp thread the practitioner
 * interview found documents arriving through: a question lives beside the
 * request it is about, and both parties see the same history.
 *
 * Bodies render as plain text with whitespace preserved — never as HTML, and
 * with no auto-linking. A firm message is sent as the signed-in member.
 * Without that session the composer stays closed.
 */
export type MessageLabels = {
  placeholder: string;
  send: string;
  sending: string;
  sent: string;
  failed: string;
  you: string;
  firmName: string;
  aboutRequest: string;
  noRequest: string;
  empty: string;
  tooLong: string;
  demoIdentity: string;
  signInRequired?: string;
  connecting: string;
  offline: string;
  live: string;
};

type Msg = {
  id: string;
  taxpayer_id: string;
  organization_id: string;
  request_id: string | null;
  sender: "taxpayer" | "firm";
  sender_name: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type RequestLite = { id: string; label_fr: string; label_en: string };

const MAX = 4000;

/**
 * The taxpayer-side entry point: resolves the demo tenant, then renders the
 * thread. The firm side passes a taxpayer id explicitly instead.
 */
export function ClientMessageThread({
  locale,
  senderName,
  labels,
}: {
  locale: "fr" | "en";
  senderName: string;
  labels: MessageLabels;
}) {
  const [tid, setTid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { demoIds } = await import("@/lib/supabase");
      const ids = await demoIds();
      if (!cancelled && ids) setTid(ids.taxpayerId);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!tid) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14 rounded-card" />
        ))}
      </div>
    );
  }
  return (
    <MessageThread
      locale={locale}
      side="taxpayer"
      taxpayerId={tid}
      senderName={senderName}
      labels={labels}
    />
  );
}

export function MessageThread({
  locale,
  side,
  taxpayerId,
  senderName,
  labels,
  firmActor = null,
  sendBlocked = null,
}: {
  locale: "fr" | "en";
  side: "taxpayer" | "firm";
  taxpayerId: string | null;
  senderName: string;
  labels: MessageLabels;
  /** Set on the firm side from the OTP session. Absent means the send is refused. */
  firmActor?: { role: ActorRole; label: string } | null;
  sendBlocked?: string | null;
}) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [requests, setRequests] = useState<RequestLite[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [about, setAbout] = useState<string>("");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!taxpayerId) return;
    try {
      const db = supabase();
      const [{ data: m }, { data: r }, { data: o }] = await Promise.all([
        db.from("messages").select("*").eq("taxpayer_id", taxpayerId).order("created_at"),
        db.from("document_requests").select("id, label_fr, label_en").eq("taxpayer_id", taxpayerId),
        db.from("organizations").select("id").order("created_at").limit(1).maybeSingle(),
      ]);
      setMsgs((m ?? []) as Msg[]);
      setRequests((r ?? []) as RequestLite[]);
      setOrgId((o?.id as string) ?? null);
    } catch {
      setError(true);
    }
  }, [taxpayerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A unique channel name per mount: supabase-js returns the SAME channel for
  // a repeated name, and calling .on after subscribe throws, so two threads on
  // one page would collide.
  useEffect(() => {
    if (!taxpayerId) return;
    const db = supabase();
    const channel = db
      .channel(`thread-${side}-${taxpayerId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `taxpayer_id=eq.${taxpayerId}`,
        },
        (payload) => {
          const row = payload.new as Msg;
          setMsgs((prev) =>
            prev && prev.some((m) => m.id === row.id) ? prev : [...(prev ?? []), row],
          );
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      db.removeChannel(channel);
    };
  }, [taxpayerId, side]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [msgs?.length]);

  async function send() {
    const body = draft.trim();
    if (!body || !taxpayerId || !orgId || sendBlocked) return;
    if (side === "firm" && !firmActor) return;
    if (body.length > MAX) {
      toast(labels.tooLong, "error");
      return;
    }

    const id = crypto.randomUUID();
    const optimistic: Msg = {
      id,
      taxpayer_id: taxpayerId,
      organization_id: orgId,
      request_id: about || null,
      sender: side,
      sender_name: senderName,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    };

    setBusy(true);
    setMsgs((prev) => [...(prev ?? []), optimistic]);
    setDraft("");

    try {
      const db = supabase();
      const { error: e } = await db.from("messages").insert(optimistic);
      if (e) throw e;

      const { recordCaseEvent } = await import("@/lib/record-event");
      await recordCaseEvent({
        taxpayerId,
        organizationId: orgId,
        actor:
          side === "firm" && firmActor
            ? { role: firmActor.role, label: firmActor.label }
            : { role: "client", label: senderName },
        kind: "note_added",
        reason: side === "firm" ? "Nouveau message de Kima / New message from Kima" : "Message envoyé / Message sent",
      });
      // Length only — the body itself never enters the audit trail.
      await audit({
        taxpayerId,
        organizationId: orgId,
        actor: side,
        action: "message.sent",
        resourceType: "message",
        resourceId: id,
        after: { length: body.length, request_id: about || null },
      });
      toast(labels.sent);
    } catch {
      setMsgs((prev) => (prev ?? []).filter((m) => m.id !== id));
      setDraft(body);
      toast(labels.failed, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!taxpayerId) return <p className="px-1 text-sm text-fg-muted">{labels.empty}</p>;
  if (error) {
    return (
      <p className="rounded-card border border-dashed border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
        {labels.offline}
      </p>
    );
  }
  if (msgs === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14 rounded-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
        <span
          className={`h-2 w-2 rounded-full ${live ? "pulse-dot bg-teal" : "bg-fg-subtle"}`}
          aria-hidden="true"
        />
        {live ? labels.live : labels.connecting}
        {sendBlocked ? ` · ${sendBlocked}` : side === "taxpayer" ? ` · ${labels.demoIdentity}` : ""}
      </p>

      <ol className="flex max-h-[26rem] flex-col gap-2.5 overflow-y-auto rounded-card border border-border bg-surface p-4">
        {msgs.length === 0 && <li className="text-sm text-fg-muted">{labels.empty}</li>}
        {msgs.map((m) => {
          const mine = m.sender === side;
          const req = requests.find((r) => r.id === m.request_id);
          return (
            <li key={m.id} className={`rise-in flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-card px-3.5 py-2.5 ${
                  mine ? "bg-navy text-surface" : "border border-border bg-surface-sunken text-fg"
                }`}
              >
                <p className="text-xs font-semibold opacity-80">
                  {mine ? labels.you : m.sender_name}
                </p>
                {req && (
                  <p className="mt-0.5 text-xs opacity-75">
                    {labels.aboutRequest} {locale === "fr" ? req.label_fr : req.label_en}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.body}</p>
                <time dateTime={m.created_at} className="mt-1 block text-xs opacity-60">
                  {new Intl.DateTimeFormat(locale === "fr" ? "fr-CM" : "en-CM", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Africa/Douala",
                  }).format(new Date(m.created_at))}
                </time>
              </div>
            </li>
          );
        })}
        <div ref={bottom} />
      </ol>

      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
        {requests.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            {labels.aboutRequest}
            <select
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              className="min-h-[40px] rounded-lg border border-border bg-surface px-2 text-sm text-fg"
            >
              <option value="">{labels.noRequest}</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {locale === "fr" ? r.label_fr : r.label_en}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="msg-body" className="sr-only">
            {labels.placeholder}
          </label>
          <textarea
            id="msg-body"
            rows={2}
            maxLength={MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            placeholder={labels.placeholder}
            disabled={Boolean(sendBlocked)}
            className="min-h-[52px] flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg disabled:bg-surface-sunken"
          />
          <button
            type="button"
            disabled={busy || Boolean(sendBlocked) || draft.trim().length === 0}
            onClick={() => void send()}
            className={`inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold text-surface disabled:opacity-50 ${
              side === "firm" ? "bg-teal-text hover:opacity-90" : "bg-navy"
            }`}
          >
            {busy ? labels.sending : labels.send}
          </button>
        </div>
      </div>
    </div>
  );
}
