"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { obligationLabel } from "@/lib/cases";
import { subscribeFirmSession } from "@/lib/firm-auth";
import { supabase } from "@/lib/supabase";

type Labels = {
  searchLabel: string;
  searchPlaceholder: string;
  searchEmpty: string;
  searchClients: string;
  searchCases: string;
  signedOut: string;
};

type Hit = {
  id: string;
  href: string;
  title: string;
  meta: string;
  group: "clients" | "cases";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Search the records this session is allowed to see.
 *
 * Queries go through the browser client, so RLS is the boundary. A miss is
 * an empty list, not a guess at another firm's files.
 */
export function FirmSearch({
  locale,
  labels,
}: {
  locale: "fr" | "en";
  labels: Labels;
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeFirmSession((session) => setSignedIn(Boolean(session))), []);

  useEffect(() => {
    const term = q.trim().replace(/[%_]/g, "");
    if (!signedIn || term.length < 2) {
      setHits(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const db = supabase();
          const found: Hit[] = [];

          const { data: taxpayers } = await db
            .from("taxpayers")
            .select("id, legal_name")
            .ilike("legal_name", `%${term}%`)
            .limit(6);

          const people = (taxpayers ?? []) as { id: string; legal_name: string }[];
          for (const person of people) {
            found.push({
              id: person.id,
              href: `/${locale}/workspace/clients`,
              title: person.legal_name,
              meta: labels.searchClients,
              group: "clients",
            });
          }

          let caseQuery = db
            .from("compliance_cases")
            .select("id, taxpayer_id, obligation_code, period_token")
            .limit(8);
          if (UUID.test(term)) {
            caseQuery = caseQuery.eq("id", term);
          } else if (people.length > 0) {
            caseQuery = caseQuery.in(
              "taxpayer_id",
              people.map((p) => p.id),
            );
          } else {
            caseQuery = caseQuery.ilike("period_token", `%${term}%`);
          }
          const { data: cases } = await caseQuery;
          const names = Object.fromEntries(people.map((p) => [p.id, p.legal_name]));
          for (const row of (cases ?? []) as {
            id: string;
            taxpayer_id: string;
            obligation_code: string;
            period_token: string;
          }[]) {
            found.push({
              id: row.id,
              href: `/${locale}/workspace/cases/${row.id}`,
              title: `${obligationLabel(row.obligation_code, locale)} · ${row.period_token}`,
              meta: names[row.taxpayer_id] ?? row.id.slice(0, 8),
              group: "cases",
            });
          }

          if (!cancelled) setHits(found);
        } catch {
          if (!cancelled) setHits([]);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, signedIn, locale, labels.searchClients]);

  return (
    <div className="relative min-w-[16rem] flex-1">
      <label htmlFor={listId} className="sr-only">
        {labels.searchLabel}
      </label>
      <input
        id={listId}
        type="search"
        value={q}
        disabled={!signedIn}
        placeholder={signedIn ? labels.searchPlaceholder : labels.signedOut}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg disabled:bg-surface-sunken disabled:text-fg-subtle"
        aria-expanded={open && hits !== null}
        aria-controls={`${listId}-results`}
        autoComplete="off"
      />
      {open && signedIn && hits && (
        <ul
          id={`${listId}-results`}
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-card border border-border bg-surface py-1 shadow-raised"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-3 text-sm text-fg-muted">{labels.searchEmpty}</li>
          ) : (
            hits.map((hit) => (
              <li key={`${hit.group}:${hit.id}`}>
                <Link
                  href={hit.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[44px] flex-col justify-center px-3 py-1.5 hover:bg-surface-sunken"
                >
                  <span className="text-sm font-medium text-fg">{hit.title}</span>
                  <span className="text-xs text-fg-subtle">
                    {hit.group === "cases" ? labels.searchCases : labels.searchClients}
                    {" · "}
                    {hit.meta}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
