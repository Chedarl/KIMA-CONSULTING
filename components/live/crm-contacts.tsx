"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRefreshTick } from "@/lib/refresh";
import { StatusPill } from "@/components/ui/status-pill";
import type { Relationship } from "@/lib/crm";

/**
 * The people, as their own object.
 *
 * KIMA listed tax files and never listed the humans attached to them, so the
 * 4 November field report found "CRM is missing on every side". The rows were
 * there; two things hid them. The policy on `contacts` carried no clause for
 * the firm that recorded the person, so an unlinked contact was write-only
 * until that was fixed. And nothing rendered them.
 *
 * Shaped after the reference CRM's foundational objects -- a person, a record
 * it is associated with, and the association's own fields -- with the one
 * correction lib/crm.ts already argues: an account here is a TAX FILE, not a
 * company. One person may hold several, which is exactly the SARL owner who
 * also files their own IRPP, and is why the association carries the
 * relationship rather than the contact carrying a single employer.
 *
 * Per-link, not per-contact: portal access is granted to a person FOR a file.
 * Access to one file never implies access to another the same person holds.
 */
type ContactRow = { id: string; full_name: string; email: string | null; phone: string | null };
type LinkRow = {
  contact_id: string;
  taxpayer_id: string;
  relationship: Relationship;
  portal_access: boolean;
  is_primary: boolean;
};

export type CrmLabels = {
  title: string;
  search: string;
  empty: string;
  emptyHint: string;
  offline: string;
  loading: string;
  colName: string;
  colFiles: string;
  colAccess: string;
  colReach: string;
  noFiles: string;
  primary: string;
  portalOn: string;
  portalOff: string;
  // Strings, not a formatter. A server component may not hand a function to a
  // client component, and the page that supplies these labels is a server
  // component.
  countOne: string;
  countMany: string;
  relationship: Record<Relationship, string>;
};

export function CrmContacts({ locale, t }: { locale: "fr" | "en"; t: CrmLabels }) {
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState("");
  const tick = useRefreshTick();

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [people, linked, files] = await Promise.all([
        db.from("contacts").select("id, full_name, email, phone").order("full_name"),
        db
          .from("contact_account_links")
          .select("contact_id, taxpayer_id, relationship, portal_access, is_primary"),
        db.from("taxpayers").select("id, legal_name"),
      ]);
      if (people.error) throw people.error;
      setOffline(false);
      setContacts((people.data ?? []) as ContactRow[]);
      setLinks((linked.data ?? []) as LinkRow[]);
      setNames(
        Object.fromEntries(
          ((files.data ?? []) as { id: string; legal_name: string }[]).map((f) => [f.id, f.legal_name]),
        ),
      );
    } catch {
      // Nothing rather than a stale address book, and never an empty list
      // pretending the firm has no contacts.
      setOffline(true);
      setContacts(null);
      setLinks([]);
      setNames({});
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = contacts ?? [];
    if (!needle) return list;
    return list.filter(
      (c) => c.full_name.toLowerCase().includes(needle) || (c.email ?? "").toLowerCase().includes(needle),
    );
  }, [contacts, q]);

  const linksFor = (id: string) => links.filter((l) => l.contact_id === id);

  if (offline) {
    return <p className="rounded-card border border-border bg-surface p-5 text-sm text-fg-muted">{t.offline}</p>;
  }
  if (contacts === null) {
    return <p className="rounded-card border border-border bg-surface p-5 text-sm text-fg-muted">{t.loading}</p>;
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1">
          <span className="sr-only">{t.search}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.search}
            className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-text"
          />
        </label>
        <p className="text-xs text-fg-muted">
          {rows.length} {rows.length === 1 ? t.countOne : t.countMany}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-card border border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-fg">{t.empty}</p>
          <p className="mt-1 text-xs text-fg-muted">{t.emptyHint}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <caption className="sr-only">{t.title}</caption>
            <thead className="border-b border-border text-[11px] uppercase tracking-wide text-fg-subtle">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colName}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colFiles}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colAccess}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colReach}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const mine = linksFor(c.id);
                return (
                  <tr key={c.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-fg">{c.full_name}</span>
                      {mine.some((l) => l.is_primary) && (
                        <StatusPill tone="neutral" size="sm" className="ml-2 align-middle">
                          {t.primary}
                        </StatusPill>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {mine.length === 0 ? (
                        <span className="text-xs text-fg-subtle">{t.noFiles}</span>
                      ) : (
                        <ul className="space-y-1">
                          {mine.map((l) => (
                            <li key={l.taxpayer_id} className="text-xs">
                              <Link
                                href={`/${locale}/workspace/clients/${l.taxpayer_id}`}
                                className="font-medium text-teal-text underline-offset-2 hover:underline"
                              >
                                {names[l.taxpayer_id] ?? l.taxpayer_id.slice(0, 8)}
                              </Link>
                              <span className="ml-2 text-fg-subtle">{t.relationship[l.relationship]}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/*
                        Access is per link. A person with two files may reach
                        one and not the other, so this reports the links rather
                        than describing the person.
                      */}
                      {mine.some((l) => l.portal_access) ? (
                        <StatusPill tone="confirmed" size="sm">{t.portalOn}</StatusPill>
                      ) : (
                        <StatusPill tone="neutral" size="sm">{t.portalOff}</StatusPill>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">
                      <span className="block">{c.email ?? "—"}</span>
                      <span className="block">{c.phone ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
