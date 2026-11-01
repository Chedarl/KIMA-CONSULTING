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
  const [assignments, setAssignments] = useState<
    { taxpayer_id: string; assigned_to: string | null }[]
  >([]);

  useEffect(() => {
    void supabase()
      .from("engagements")
      .select("taxpayer_id, assigned_to")
      .then(({ data }) =>
        setAssignments((data ?? []) as { taxpayer_id: string; assigned_to: string | null }[]),
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const db = supabase();

    void (async () => {
      const [{ data: tp }, { data: msgs }] = await Promise.all([
        db.from("taxpayers").select("id, legal_name").order("legal_name"),
        db
          .from("messages")
          .select("taxpayer_id, body, created_at, sender, read_at")
          .order("created_at", { ascending: false })
          .limit(400),
      ]);
      if (cancelled) return;

      const map: Record<string, Preview> = {};
      for (const m of (msgs ?? []) as {
        taxpayer_id: string;
        body: string;
        created_at: string;
        sender: string;
        read_at: string | null;
      }[]) {
        const slot = (map[m.taxpayer_id] ??= {
          body: m.body,
          created_at: m.created_at,
          sender: m.sender,
          unread: 0,
        });
        if (m.sender === "taxpayer" && !m.read_at) slot.unread += 1;
      }
      setPreviews(map);
      const list = (tp ?? []) as Client[];
      setClients(list);
      if (list.length > 0) setActive(list[0].id);
    })();

    const channel = db
      .channel(`firm-messages-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        const row = p.new as {
          taxpayer_id: string;
          body: string;
          created_at: string;
          sender: string;
        };
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

    return () => {
      cancelled = true;
      db.removeChannel(channel);
    };
  }, []);

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
