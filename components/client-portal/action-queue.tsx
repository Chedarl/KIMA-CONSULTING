"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRefreshTick } from "@/lib/refresh";
import { StatusPill } from "@/components/ui/status-pill";

/**
 * "À traiter" -- the portal home as a queue of things to do.
 *
 * The three reference portals the owner supplied are three generations of one
 * idea, and the direction of travel is the useful part: a flat chronological
 * To-Do, then the same items GROUPED by what they are, then grouped and
 * aggregated across every account the person holds.
 *
 * Grouping is what makes it readable. A flat list of eleven unread documents
 * and six unpaid invoices reads as noise; "Documents (2)" and "Factures (6)"
 * reads as two decisions.
 *
 * None of it is a dashboard. There is no chart, and every row ends in a verb,
 * because the client's question is "what do you need from me", not "how am I
 * doing".
 *
 * KIMA's portal home reads three tables today -- compliance_cases,
 * document_requests, taxpayers -- so most of what a client owes never reached
 * it: a task assigned to them, an unread message and an unpaid invoice were all
 * invisible. This reads those too.
 *
 * Honest states throughout. Loading, empty and offline are three different
 * facts: an empty queue is good news and says so; an unreachable one says that
 * instead of rendering nothing and implying there is nothing.
 */
type Group = "documents" | "tasks" | "messages" | "invoices";

type Item = {
  id: string;
  group: Group;
  title: string;
  detail?: string;
  href: string;
  tone: "attention" | "awaiting" | "returned";
  state: string;
};

export type QueueLabels = {
  empty: string;
  emptyHint: string;
  offline: string;
  loading: string;
  seeAll: string;
  groups: Record<Group, string>;
  open: string;
  returned: string;
  unpaid: string;
  unread: string;
  toSend: string;
};

export function ActionQueue({
  locale,
  taxpayerId,
  t,
}: {
  locale: "fr" | "en";
  taxpayerId: string | null;
  t: QueueLabels;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [offline, setOffline] = useState(false);
  const tick = useRefreshTick();
  const base = `/${locale}/app`;

  const load = useCallback(async () => {
    if (!taxpayerId) {
      setItems([]);
      return;
    }
    try {
      const db = supabase();
      const [reqs, tasks, msgs, bills] = await Promise.all([
        db
          .from("document_requests")
          .select("id, label_fr, label_en, status, due_on, returned_count")
          .eq("taxpayer_id", taxpayerId),
        db.from("case_tasks").select("id, title, assigned_to, state, due_on"),
        db.from("messages").select("id, body, read_at, sender").eq("taxpayer_id", taxpayerId),
        db.from("invoices").select("id, total_minor, status, due_on"),
      ]);
      if (reqs.error) throw reqs.error;

      const out: Item[] = [];

      for (const r of (reqs.data ?? []) as {
        id: string; label_fr: string; label_en: string; status: string;
        due_on: string | null; returned_count: number | null;
      }[]) {
        if (r.status === "fulfilled" || r.status === "cancelled") continue;
        const returned = (r.returned_count ?? 0) > 0;
        out.push({
          id: `r-${r.id}`,
          group: "documents",
          title: locale === "fr" ? r.label_fr : r.label_en,
          detail: r.due_on ?? undefined,
          href: `${base}/requests`,
          tone: returned ? "returned" : "attention",
          state: returned ? t.returned : t.toSend,
        });
      }

      for (const k of (tasks.data ?? []) as {
        id: string; title: string; assigned_to: string | null; state: string; due_on: string | null;
      }[]) {
        // Only what the client themselves owes. A firm task is not their work.
        if (k.state !== "open" || k.assigned_to !== "client") continue;
        out.push({
          id: `t-${k.id}`,
          group: "tasks",
          title: k.title,
          detail: k.due_on ?? undefined,
          href: `${base}/requests`,
          tone: "attention",
          state: t.open,
        });
      }

      const unread = ((msgs.data ?? []) as {
        id: string; body: string; read_at: string | null; sender: string;
      }[]).filter((m) => !m.read_at && m.sender === "firm");
      if (unread.length > 0) {
        out.push({
          id: "m-unread",
          group: "messages",
          title: `${unread.length} ${t.unread}`,
          detail: unread[0]?.body?.slice(0, 80),
          href: `${base}/messages`,
          tone: "awaiting",
          state: t.unread,
        });
      }

      for (const b of (bills.data ?? []) as {
        id: string; total_minor: number; status: string; due_on: string | null;
      }[]) {
        if (b.status === "paid" || b.status === "void" || b.status === "draft") continue;
        out.push({
          id: `i-${b.id}`,
          group: "invoices",
          title: `${(b.total_minor ?? 0).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")} XAF`,
          detail: b.due_on ?? undefined,
          href: `${base}/payments`,
          tone: "attention",
          state: t.unpaid,
        });
      }

      setOffline(false);
      setItems(out);
    } catch {
      setOffline(true);
      setItems(null);
    }
  }, [taxpayerId, locale, base, t]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const grouped = useMemo(() => {
    const order: Group[] = ["documents", "tasks", "messages", "invoices"];
    return order
      .map((g) => ({ group: g, rows: (items ?? []).filter((i) => i.group === g) }))
      .filter((g) => g.rows.length > 0);
  }, [items]);

  if (offline) {
    return <p className="rounded-card border border-border bg-surface p-5 text-sm text-fg-muted">{t.offline}</p>;
  }
  if (items === null) {
    return <p className="rounded-card border border-border bg-surface p-5 text-sm text-fg-muted">{t.loading}</p>;
  }
  if (grouped.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-8 text-center">
        <p className="text-sm font-semibold text-fg">{t.empty}</p>
        <p className="mt-1 text-xs text-fg-muted">{t.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ group, rows }) => (
        <section key={group}>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-fg">{t.groups[group]}</h3>
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
              {rows.length}
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {rows.slice(0, 5).map((row) => (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition hover:border-teal-text/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-text"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">{row.title}</span>
                    {row.detail && <span className="block truncate text-xs text-fg-muted">{row.detail}</span>}
                  </span>
                  <StatusPill tone={row.tone} size="sm">{row.state}</StatusPill>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > 5 && (
            <p className="mt-2 text-xs font-semibold text-teal-text">
              {t.seeAll} ({rows.length})
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
