"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audit, sessionTaxpayerId, supabase } from "@/lib/supabase";
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

type RequestLite = { id: string; organization_id: string; label_fr: string; label_en: string };
type FirmChoice = { id: string; name: string };

const MAX = 4000;

/**
 * The taxpayer-side entry point: resolves the demo tenant, then renders the
 * thread. The firm side passes a taxpayer id explicitly instead.
 */
export function ClientMessageThread({
  locale,
  senderName,
  labels,
  appearance = "default",
  heading,
}: {
  locale: "fr" | "en";
  senderName: string;
  labels: MessageLabels;
  appearance?: "default" | "portal";
  heading?: string;
}) {
  const [tid, setTid] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const authEpoch = useRef(0);
  const identityRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = supabase().auth.onAuthStateChange((event, session) => {
      if (!active || (event !== "SIGNED_OUT" && event !== "SIGNED_IN" &&
          event !== "USER_UPDATED" && event !== "INITIAL_SESSION")) return;
      const nextUserId = event === "SIGNED_OUT" ? null : session?.user?.id ?? null;
      if (nextUserId === identityRef.current) return;
      identityRef.current = nextUserId;
      const epoch = ++authEpoch.current;
      // Unmount the old taxpayer thread before resolving the next account.
      setTid(null);
      setResolved(!nextUserId);
      if (timer) clearTimeout(timer);
      if (!nextUserId) return;
      // Supabase reads must run outside the auth state callback.
      timer = setTimeout(() => {
        void (async () => {
          try {
            const { sessionTaxpayerId } = await import("@/lib/supabase");
            const id = await sessionTaxpayerId();
            if (!active || epoch !== authEpoch.current) return;
            setTid(id);
            setResolved(true);
          } catch {
            if (!active || epoch !== authEpoch.current) return;
            setTid(null);
            setResolved(true);
          }
        })();
      }, 0);
    });
    return () => {
      active = false;
      ++authEpoch.current;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  if (!resolved) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14 rounded-card" />
        ))}
      </div>
    );
  }
  if (!tid) return <p role="status" className="text-sm text-fg-muted">{labels.signInRequired ?? labels.offline}</p>;
  return (
    <MessageThread
      key={`${identityRef.current ?? "none"}:${tid}`}
      locale={locale}
      side="taxpayer"
      taxpayerId={tid}
      senderName={senderName}
      labels={labels}
      appearance={appearance}
      heading={heading}
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
  appearance = "default",
  heading,
}: {
  locale: "fr" | "en";
  side: "taxpayer" | "firm";
  taxpayerId: string | null;
  senderName: string;
  labels: MessageLabels;
  /** Set on the firm side from the OTP session. Absent means the send is refused. */
  firmActor?: { role: ActorRole; label: string; memberId: string } | null;
  sendBlocked?: string | null;
  /** Client portal layout. Firm workspace keeps the default thread. */
  appearance?: "default" | "portal";
  heading?: string;
}) {
  const toast = useToast();
  const firmMemberId = firmActor?.memberId ?? null;
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [requests, setRequests] = useState<RequestLite[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [firms, setFirms] = useState<FirmChoice[]>([]);
  const [draft, setDraft] = useState("");
  const [about, setAbout] = useState<string>("");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [threadId, setThreadId] = useState("general");
  const bottom = useRef<HTMLDivElement>(null);
  const currentTaxpayer = useRef(taxpayerId);
  currentTaxpayer.current = taxpayerId;
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!taxpayerId) return;
    try {
      const db = supabase();
      // Recheck the mounted taxpayer against Auth and RLS before any thread read.
      // A parent wrapper may have been unmounted during an account switch.
      if (side === "taxpayer" && (await sessionTaxpayerId()) !== taxpayerId) {
        throw new Error("Taxpayer session unavailable");
      }
      // Firm staff can message only through their own RLS-visible organisation.
      // Never offer a firm's staff the taxpayer's other active firms as recipients.
      if (side === "firm" && !firmMemberId) {
        setFirms([]);
        setOrgId(null);
        setMsgs([]);
        setRequests([]);
        return;
      }
      let firmOrgId: string | null = null;
      if (side === "firm") {
        // A supplied OTP member ID is not proof of the current Auth identity.
        const { data: { user }, error: authError } = await db.auth.getUser();
        if (authError || !user) throw new Error("Firm authentication unavailable");
        const { data: member, error: memberError } = await db.from("firm_members")
          .select("organization_id")
          .eq("id", firmMemberId!)
          .eq("auth_user_id", user.id)
          .eq("active", true)
          .is("deactivated_at", null)
          .maybeSingle();
        if (memberError || !member?.organization_id) throw new Error("Firm member unavailable");
        firmOrgId = member.organization_id as string;
      }
      const messageQuery = db.from("messages").select("*").eq("taxpayer_id", taxpayerId);
      const requestQuery = db.from("document_requests")
        .select("id, organization_id, label_fr, label_en").eq("taxpayer_id", taxpayerId);
      const engagementQuery = db.from("engagements")
        .select("organization_id, status, authorized_at, accepted_at, revoked_at")
        .eq("taxpayer_id", taxpayerId)
        .in("status", ["accepted", "authorized"])
        .is("revoked_at", null);
      const [{ data: m, error: messagesError }, { data: r, error: requestsError },
        { data: grants, error: grantError }, { data: directory }] = await Promise.all([
        (firmOrgId ? messageQuery.eq("organization_id", firmOrgId) : messageQuery).order("created_at"),
        firmOrgId ? requestQuery.eq("organization_id", firmOrgId) : requestQuery,
        firmOrgId ? engagementQuery.eq("organization_id", firmOrgId) : engagementQuery,
        db.rpc("firm_directory"),
      ]);
      if (generation !== loadGeneration.current || taxpayerId !== currentTaxpayer.current) return;
      if (grantError || messagesError || requestsError) {
        throw grantError ?? messagesError ?? requestsError;
      }
      const liveIds = [...new Set((grants ?? [])
        .filter((grant) => grant.authorized_at || grant.accepted_at)
        .map((grant) => grant.organization_id as string))];
      const names = new Map<string, string>((directory ?? []).map(
        (firm: { id: string; name: string }) => [firm.id, firm.name] as const));
      setFirms(liveIds.map((id) => ({
        id,
        name: names.get(id) ?? `${labels.firmName} (${id.slice(0, 8)})`,
      })));
      setOrgId((current) =>
        current && liveIds.includes(current)
          ? current : liveIds.length === 1 ? liveIds[0] : null);
      // Never retain message/request data for a firm whose engagement was
      // revoked, even if an earlier RLS-visible response contained that row.
      const allowedFirmIds = new Set(liveIds);
      setMsgs(((m ?? []) as Msg[]).filter((message) => allowedFirmIds.has(message.organization_id)));
      setRequests(((r ?? []) as RequestLite[]).filter((request) => allowedFirmIds.has(request.organization_id)));
      setError(false);
    } catch {
      if (generation !== loadGeneration.current || taxpayerId !== currentTaxpayer.current) return;
      setOrgId(null);
      setFirms([]);
      setMsgs([]);
      setRequests([]);
      setError(true);
    }
  }, [taxpayerId, labels.firmName, side, firmMemberId]);

  useEffect(() => {
    setOrgId(null);
    setFirms([]);
    setMsgs(null);
    setRequests([]);
    void load();
    return () => { ++loadGeneration.current; };
  }, [load]);

  // Revalidate client message access after focus, tab visibility changes, and
  // periodically. A revoked engagement must not leave a mounted conversation
  // visible indefinitely. Clear the snapshot before checking Auth and grants;
  // generation checks prevent an older response from restoring stale data.
  useEffect(() => {
    if (side !== "taxpayer" || !taxpayerId) return;
    const refreshClientAccess = () => {
      setMsgs(null);
      setRequests([]);
      setFirms([]);
      setOrgId(null);
      setLive(false);
      setError(false);
      void load();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshClientAccess();
    };
    const timer = window.setInterval(refreshClientAccess, 60_000);
    window.addEventListener("focus", refreshClientAccess);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshClientAccess);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [side, taxpayerId, load]);

  // A unique channel name per mount: supabase-js returns the SAME channel for
  // a repeated name, and calling .on after subscribe throws, so two threads on
  // one page would collide.
  useEffect(() => {
    if (!taxpayerId || !orgId) return;
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
          if (row.organization_id !== orgId) return;
          // Realtime payloads can outlive a member's or taxpayer's engagement.
          // Treat the event as an invalidation; the loader rechecks Auth,
          // active grants and tenant-scoped reads before publishing content.
          void load();
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      db.removeChannel(channel);
    };
  }, [taxpayerId, side, orgId, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [msgs?.length]);

  async function send(requestId = about) {
    const body = draft.trim();
    if (!body || !taxpayerId || !orgId || sendBlocked || busy) return;
    if (side === "firm" && !firmActor) return;
    if (body.length > MAX) {
      toast(labels.tooLong, "error");
      return;
    }

    // Stale or revoked grants must never be used even if the picker has not refreshed.
    const chosenOrg = orgId;
    if (requestId && !requests.some((r) => r.id === requestId && r.organization_id === chosenOrg)) return;
    const id = crypto.randomUUID();
    const optimistic: Msg = {
      id,
      taxpayer_id: taxpayerId,
      organization_id: orgId,
      request_id: requestId || null,
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
      // An in-flight composer can outlive its original portal identity.
      // Reject a stale taxpayer before querying grants or inserting a message.
      if (side === "taxpayer" && (await sessionTaxpayerId()) !== taxpayerId) {
        throw new Error("Taxpayer session unavailable");
      }
      if (side === "firm") {
        if (!firmMemberId) throw new Error("Firm session required");
        // Rebind the member to Auth immediately before the write; a stale OTP
        // session must not be able to send through another member's firm.
        const { data: { user }, error: authError } = await db.auth.getUser();
        if (authError || !user) throw new Error("Firm authentication unavailable");
        const { data: member, error: memberError } = await db.from("firm_members")
          .select("organization_id")
          .eq("id", firmMemberId)
          .eq("auth_user_id", user.id)
          .eq("active", true)
          .is("deactivated_at", null)
          .maybeSingle();
        if (memberError || member?.organization_id !== chosenOrg) {
          throw new Error("Cannot message another firm's client");
        }
      }
      const { data: current, error: grantError } = await db.from("engagements")
        .select("status, authorized_at, accepted_at")
        .eq("taxpayer_id", taxpayerId).eq("organization_id", chosenOrg)
        .in("status", ["accepted", "authorized"])
        .is("revoked_at", null).limit(1).maybeSingle();
      if (grantError || !current || !(current.authorized_at || current.accepted_at)) {
        throw new Error("Engagement is not authorized");
      }
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
        after: { length: body.length, request_id: requestId || null },
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

  const visibleMsgs = msgs.filter((m) => m.organization_id === orgId);
  const visibleRequests = requests.filter((r) => r.organization_id === orgId);
  const firmPicker = firms.length > 1 ? (
    <label className="flex flex-wrap items-center gap-2 text-sm text-fg">
      {locale === "fr" ? "Cabinet destinataire" : "Receiving accounting firm"}
      <select
        aria-label={locale === "fr" ? "Choisir le cabinet destinataire" : "Choose receiving firm"}
        value={orgId ?? ""}
        onChange={(event) => {
          const id = event.target.value;
          setOrgId(firms.some((firm) => firm.id === id) ? id : null);
          setThreadId("general");
          setAbout("");
        }}
        className="min-h-[44px] rounded-lg border border-border bg-white px-3 text-sm"
      >
        <option value="">{locale === "fr" ? "Sélectionner un cabinet" : "Select a firm"}</option>
        {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
      </select>
    </label>
  ) : null;
  const needsFirm = !orgId;
  const activeFirmLabel = firms.find((firm) => firm.id === orgId)?.name ?? labels.firmName;
  const chooseHint = locale === "fr"
    ? "Sélectionnez un cabinet autorisé pour ce dossier avant d’envoyer un message."
    : "Select an authorized firm for this company before sending a message.";

  if (appearance === "portal") {
    const groups = new Map<string, { id: string; title: string; preview: string; unread: boolean }>();
    groups.set("general", { id: "general", title: labels.noRequest, preview: "", unread: false });
    for (const r of visibleRequests) {
      groups.set(r.id, {
        id: r.id,
        title: locale === "fr" ? r.label_fr : r.label_en,
        preview: "",
        unread: false,
      });
    }
    for (const m of visibleMsgs) {
      const id = m.request_id ?? "general";
      const slot = groups.get(id) ?? { id, title: labels.firmName, preview: "", unread: false };
      slot.preview = m.body;
      if (m.sender === "firm" && !m.read_at) slot.unread = true;
      groups.set(id, slot);
    }
    const list = [...groups.values()];
    const activeId = groups.has(threadId) ? threadId : "general";
    const shown = visibleMsgs.filter((m) => (m.request_id ?? "general") === activeId);
    const activeTitle = groups.get(activeId)?.title ?? labels.firmName;

    return (
      <div className="flex flex-col gap-4">
        {heading && <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-fg">{heading}</h1>}
        {firmPicker}
        {needsFirm && <p role="status" className="text-sm text-fg-muted">{chooseHint}</p>}
        <div className="grid min-h-[32rem] overflow-hidden rounded-card border border-border bg-white shadow-card lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-border lg:border-b-0 lg:border-r">
            <ul className="flex gap-2 overflow-x-auto p-2 lg:flex-col">
              {list.map((g) => (
                <li key={g.id} className="min-w-[12rem] lg:min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setThreadId(g.id);
                      setAbout(g.id === "general" ? "" : g.id);
                    }}
                    aria-current={g.id === activeId ? "true" : undefined}
                    className={`flex min-h-[56px] w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-sunken ${
                      g.id === activeId ? "bg-surface-sunken" : ""
                    }`}
                  >
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${g.unread ? "bg-amber" : "bg-transparent"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">{activeFirmLabel}</span>
                      <span className="block truncate text-xs text-fg-muted">{g.title}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="flex min-h-[24rem] flex-col">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-fg">{activeFirmLabel}</p>
              <p className="text-xs text-fg-muted">{activeTitle}</p>
            </div>
            <ol className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
              {shown.length === 0 && (
                <li className="text-sm text-fg-muted">
                  {labels.empty}
                </li>
              )}
              {shown.map((m) => {
                const mine = m.sender === "taxpayer";
                return (
                  <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm text-white ${mine ? "bg-teal-text" : "bg-navy"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                  </li>
                );
              })}
              <div ref={bottom} />
            </ol>
            <form
              className="flex items-center gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(activeId === "general" ? "" : activeId);
              }}
            >
              <label htmlFor="portal-msg" className="sr-only">{labels.placeholder}</label>
              <input
                id="portal-msg"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={labels.placeholder}
                disabled={Boolean(sendBlocked) || needsFirm}
                className="min-h-[44px] flex-1 rounded-lg border border-border px-3 text-sm"
              />
              <button
                type="submit"
                disabled={busy || Boolean(sendBlocked) || needsFirm || draft.trim().length === 0}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? labels.sending : labels.send}
              </button>
            </form>
          </div>
        </div>
        <p className="text-xs text-fg-subtle">{labels.demoIdentity}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {firmPicker}
      {needsFirm && <p role="status" className="text-sm text-fg-muted">{chooseHint}</p>}
      <p className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
        <span
          className={`h-2 w-2 rounded-full ${live ? "pulse-dot bg-teal" : "bg-fg-subtle"}`}
          aria-hidden="true"
        />
        {live ? labels.live : labels.connecting}
        {sendBlocked ? ` · ${sendBlocked}` : side === "taxpayer" ? ` · ${labels.demoIdentity}` : ""}
      </p>

      <ol className="flex max-h-[26rem] flex-col gap-2.5 overflow-y-auto rounded-card border border-border bg-surface p-4">
        {visibleMsgs.length === 0 && <li className="text-sm text-fg-muted">{labels.empty}</li>}
        {visibleMsgs.map((m) => {
          const mine = m.sender === side;
          const req = visibleRequests.find((r) => r.id === m.request_id);
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
        {visibleRequests.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            {labels.aboutRequest}
            <select
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              className="min-h-[40px] rounded-lg border border-border bg-surface px-2 text-sm text-fg"
            >
              <option value="">{labels.noRequest}</option>
              {visibleRequests.map((r) => (
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
            disabled={Boolean(sendBlocked) || needsFirm}
            className="min-h-[52px] flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg disabled:bg-surface-sunken"
          />
          <button
            type="button"
            disabled={busy || Boolean(sendBlocked) || needsFirm || draft.trim().length === 0}
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
