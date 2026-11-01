"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageThread, type MessageLabels } from "@/components/live/message-thread";
import {
  memberFromSession,
  subscribeFirmSession,
  type FirmSession,
} from "@/lib/firm-auth";
import { can, denialLabel } from "@/lib/permissions";

/**
 * The firm's side of messaging: every client conversation in one place, with
 * the thread opening beside the list.
 *
 * The list subscribes once and filters in memory; the open thread keeps its
 * own filtered subscription. Both use uniquely-named channels, because
 * supabase-js returns the same channel for a repeated name and throws if you
 * attach a handler after subscribing.
 */
type Client = { id: string; legal_name: string };
type Preview = { body: string; created_at: string; sender: string; unread: number };

type WorkspaceLabels = MessageLabels & {
  threadsTitle: string;
  noThreads: string;
  select: string;
  unread: string;
};

/** A new OTP session must never inherit a prior firm's preview or thread. */
export function MessagesWorkspace({
  locale,
  labels,
}: {
  locale: "fr" | "en";
  labels: WorkspaceLabels;
}) {
  const [session, setSession] = useState<FirmSession | null>(null);
  useEffect(() => subscribeFirmSession(setSession), []);

  if (!session) return <p role="status" className="text-sm text-fg-muted">{labels.signInRequired ?? labels.demoIdentity}</p>;
  return (
    <FirmMessagesView
      key={`${session.memberId}:${session.signedInAt}`}
      locale={locale}
      labels={labels}
      session={session}
    />
  );
}

function FirmMessagesView({
  locale,
  labels,
  session,
}: {
  locale: "fr" | "en";
  labels: WorkspaceLabels;
  session: FirmSession;
}) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [active, setActive] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [assignments, setAssignments] = useState<
    { taxpayer_id: string; assigned_to: string | null }[]
  >([]);
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  // Revalidate the current member and active engagements after the tab regains
  // focus and at a bounded interval. Clear the old snapshot before each check:
  // revoked clients must not remain on screen while access is being verified.
  // Database RLS remains the final authorization boundary for reads and writes.
  useEffect(() => {
    const refreshAccess = () => {
      setClients(null);
      setPreviews({});
      setActive(null);
      setAssignments([]);
      setOffline(false);
      setRefreshEpoch((epoch) => epoch + 1);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshAccess();
    };
    const timer = window.setInterval(refreshAccess, 60_000);
    window.addEventListener("focus", refreshAccess);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshAccess);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [session.memberId]);

  useEffect(() => {
    let cancelled = false;
    const db = supabase();
    let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;

    void (async () => {
      try {
        // The OTP member ID is client-side state. Bind it to the current
        // authenticated user before using it to select a firm's records.
        const { data: { user }, error: authError } = await db.auth.getUser();
        if (cancelled) return;
        if (authError || !user) throw new Error("Firm authentication unavailable");
        const { data: member, error: memberError } = await db
          .from("firm_members")
          .select("organization_id")
          .eq("id", session.memberId)
          .eq("auth_user_id", user.id)
          .eq("active", true)
          .is("deactivated_at", null)
          .maybeSingle();
        if (cancelled) return;
        if (memberError || !member?.organization_id) throw new Error("Firm member unavailable");
        const firmOrgId = member.organization_id as string;

        // A taxpayer may have multiple firms. Only active grants belonging to
        // this member's firm may contribute a name, assignment or preview.
        const { data: engagements, error: engagementsError } = await db
          .from("engagements")
          .select("taxpayer_id, assigned_to, authorized_at, accepted_at")
          .eq("organization_id", firmOrgId)
          .in("status", ["accepted", "authorized"])
          .is("revoked_at", null);
        if (cancelled) return;
        if (engagementsError) throw engagementsError;
        const activeEngagements = ((engagements ?? []) as {
          taxpayer_id: string;
          assigned_to: string | null;
          authorized_at: string | null;
          accepted_at: string | null;
        }[]).filter((e) => e.authorized_at || e.accepted_at);
        const taxpayerIds = [...new Set(activeEngagements.map((e) => e.taxpayer_id))];
        if (taxpayerIds.length === 0) {
          setAssignments([]);
          setPreviews({});
          setClients([]);
          setActive(null);
          setOffline(false);
          return;
        }

        const [{ data: tp, error: taxpayersError }, { data: msgs, error: messagesError }] =
          await Promise.all([
            db.from("taxpayers")
              .select("id, legal_name")
              .in("id", taxpayerIds)
              .order("legal_name"),
            db.from("messages")
              .select("taxpayer_id, organization_id, body, created_at, sender, read_at")
              .eq("organization_id", firmOrgId)
              .in("taxpayer_id", taxpayerIds)
              .order("created_at", { ascending: false })
              .limit(400),
          ]);
        if (cancelled) return;
        if (taxpayersError || messagesError) throw taxpayersError ?? messagesError;
        const allowedTaxpayers = new Set(taxpayerIds);
        const map: Record<string, Preview> = {};
        for (const m of (msgs ?? []) as {
          taxpayer_id: string;
          organization_id: string;
          body: string;
          created_at: string;
          sender: string;
          read_at: string | null;
        }[]) {
          if (m.organization_id !== firmOrgId || !allowedTaxpayers.has(m.taxpayer_id)) continue;
          const slot = (map[m.taxpayer_id] ??= {
            body: m.body,
            created_at: m.created_at,
            sender: m.sender,
            unread: 0,
          });
          if (m.sender === "taxpayer" && !m.read_at) slot.unread += 1;
        }
        const list = ((tp ?? []) as Client[]).filter((c) => allowedTaxpayers.has(c.id));
        setAssignments(activeEngagements.map(({ taxpayer_id, assigned_to }) => ({ taxpayer_id, assigned_to })));
        setPreviews(map);
        setClients(list);
        setActive(list[0]?.id ?? null);
        setOffline(false);

        // Realtime events are not trusted as a tenant selector. Check both
        // organization and the authorized taxpayer set before updating UI.
        channel = db
          .channel(`firm-messages-${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `organization_id=eq.${firmOrgId}`,
          }, (p) => {
            if (cancelled) return;
            const row = p.new as {
              taxpayer_id: string;
              organization_id: string;
              body: string;
              created_at: string;
              sender: string;
            };
            if (row.organization_id !== firmOrgId || !allowedTaxpayers.has(row.taxpayer_id)) return;
            setPreviews((prev) => ({
              ...prev,
              [row.taxpayer_id]: {
                body: row.body,
                created_at: row.created_at,
                sender: row.sender,
                unread:
                  row.sender === "taxpayer"
                    ? (prev[row.taxpayer_id]?.unread ?? 0) + 1
                    : (prev[row.taxpayer_id]?.unread ?? 0),
              },
            }));
          })
          .subscribe();
      } catch {
        if (cancelled) return;
        setAssignments([]);
        setPreviews({});
        setClients([]);
        setActive(null);
        setOffline(true);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) void db.removeChannel(channel);
    };
  }, [session.memberId, refreshEpoch]);

  const sorted = useMemo(() => {
    if (!clients) return null;
    return [...clients].sort((a, b) =>
      (previews[b.id]?.created_at ?? "").localeCompare(previews[a.id]?.created_at ?? ""),
    );
  }, [clients, previews]);

  const sendBlocked = useMemo(() => {
    if (!session) return labels.signInRequired ?? labels.demoIdentity;
    if (!active) return null;
    const member = memberFromSession(session);
    const verdict = can(
      {
        kind: "firm",
        member,
        assignedTaxpayerIds: assignments
          .filter((e) => e.assigned_to && e.assigned_to === member.person_label)
          .map((e) => e.taxpayer_id),
      },
      "note.write_client",
      active,
    );
    return verdict.ok ? null : denialLabel(verdict.reason, locale);
  }, [session, active, assignments, labels.signInRequired, labels.demoIdentity, locale]);

  if (offline) return <p role="alert" className="text-sm text-fg-muted">{labels.offline}</p>;

  if (sorted === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16 rounded-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <nav aria-label={labels.threadsTitle} className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          {labels.threadsTitle}
        </p>
        {sorted.length === 0 && <p className="text-sm text-fg-muted">{labels.noThreads}</p>}
        {sorted.map((c) => {
          const p = previews[c.id];
          const isActive = c.id === active;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              aria-current={isActive ? "true" : undefined}
              className={`min-h-[44px] rounded-card border px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "border-navy bg-navy-soft"
                  : "border-border bg-surface hover:bg-surface-sunken"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-fg">{c.legal_name}</span>
                {p && p.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-soft px-1.5 py-0.5 text-xs font-semibold text-amber-text">
                    {p.unread} <span className="sr-only">{labels.unread}</span>
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs text-fg-muted">
                {p ? p.body : labels.empty}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-col">
        {active ? (
          <MessageThread
            key={active}
            locale={locale}
            side="firm"
            taxpayerId={active}
            senderName={session?.personLabel ?? labels.firmName}
            labels={labels}
            firmActor={
              session ? { role: session.role, label: session.personLabel, memberId: session.memberId } : null
            }
            sendBlocked={sendBlocked}
          />
        ) : (
          <p className="text-sm text-fg-muted">{labels.select}</p>
        )}
      </div>
    </div>
  );
}
