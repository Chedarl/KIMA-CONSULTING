"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRefreshTick } from "@/lib/refresh";
import { StatusPill } from "@/components/ui/status-pill";
import type { Relationship } from "@/lib/crm";

/**
 * The tax files this person holds -- the half of the account switcher that
 * belongs on this side of the house.
 *
 * All three reference portals carry "Switch account" with a count, and one of
 * them lists every account's outstanding work beside it. KIMA has the data and
 * no surface: contact_account_links has said since October that one human may
 * hold several files, which is the SARL owner who also files their own IRPP.
 *
 * This lists them and marks the one in view. It does NOT switch the session --
 * that means writing portal-auth state, which AGENTS.md puts under Agent A, so
 * it is a separate change with its own review rather than something smuggled
 * into a client component.
 *
 * Access is per link. Reaching one file never implies reaching another the
 * same person holds, so this shows only the links the policy already returns
 * and widens nothing.
 */
type Link = { taxpayer_id: string; relationship: Relationship; is_primary: boolean };

export type FilesLabels = {
  loading: string;
  offline: string;
  current: string;
};

export function MyFiles({ taxpayerId, t }: { taxpayerId: string | null; t: FilesLabels }) {
  const [rows, setRows] = useState<{ id: string; name: string; link: Link }[] | null>(null);
  const [offline, setOffline] = useState(false);
  const tick = useRefreshTick();

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const me = await db.auth.getUser();
      const uid = me.data.user?.id;
      if (!uid) {
        setOffline(false);
        setRows([]);
        return;
      }
      const person = await db.from("contacts").select("id").eq("auth_user_id", uid).maybeSingle();
      if (person.error) throw person.error;
      const contactId = (person.data as { id: string } | null)?.id;
      if (!contactId) {
        setOffline(false);
        setRows([]);
        return;
      }
      const links = await db
        .from("contact_account_links")
        .select("taxpayer_id, relationship, is_primary")
        .eq("contact_id", contactId);
      if (links.error) throw links.error;
      const list = (links.data ?? []) as Link[];
      const files = await db
        .from("taxpayers")
        .select("id, legal_name")
        .in("id", list.map((l) => l.taxpayer_id));
      const names = Object.fromEntries(
        ((files.data ?? []) as { id: string; legal_name: string }[]).map((f) => [f.id, f.legal_name]),
      );
      setOffline(false);
      setRows(
        list.map((l) => ({
          id: l.taxpayer_id,
          name: names[l.taxpayer_id] ?? l.taxpayer_id.slice(0, 8),
          link: l,
        })),
      );
    } catch {
      setOffline(true);
      setRows(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  if (offline) {
    return <p className="rounded-card border border-border bg-surface p-4 text-sm text-fg-muted">{t.offline}</p>;
  }
  if (rows === null) {
    return <p className="rounded-card border border-border bg-surface p-4 text-sm text-fg-muted">{t.loading}</p>;
  }
  // One file is not a switcher. Render nothing rather than a list of one.
  if (rows.length < 2) return null;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{r.name}</span>
          {r.id === taxpayerId && (
            <StatusPill tone="confirmed" size="sm">
              {t.current}
            </StatusPill>
          )}
        </li>
      ))}
    </ul>
  );
}
