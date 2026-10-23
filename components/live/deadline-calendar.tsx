"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { obligationLabel, type ComplianceCase } from "@/lib/cases";
import { supabase } from "@/lib/supabase";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";

type Dict = ReturnType<typeof getWorkspaceDictionary>["deadlineCalendar"];

type Row = Pick<
  ComplianceCase,
  "id" | "taxpayer_id" | "obligation_code" | "period_token" | "due_on" | "due_basis" | "due_needs_confirmation"
> & { taxpayer_name?: string | null };

/**
 * Open-case deadlines. Statutory and prorogued stay labelled apart, and a
 * date the rules cannot confirm is amber rather than treated as final.
 */
export function DeadlineCalendar({ locale, t }: { locale: "fr" | "en"; t: Dict }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [cases, taxpayers] = await Promise.all([
        db
          .from("compliance_cases")
          .select(
            "id, taxpayer_id, obligation_code, period_token, due_on, due_basis, due_needs_confirmation",
          )
          .is("closed_at", null)
          .not("due_on", "is", null)
          .order("due_on", { ascending: true }),
        db.from("taxpayers").select("id, legal_name"),
      ]);
      if (cases.error) throw cases.error;
      setRows((cases.data ?? []) as Row[]);
      setNames(
        Object.fromEntries(
          ((taxpayers.data ?? []) as { id: string; legal_name: string }[]).map((p) => [
            p.id,
            p.legal_name,
          ]),
        ),
      );
      setOffline(false);
    } catch {
      setOffline(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      {offline && <p className="text-sm text-amber-text">{t.offline}</p>}
      {rows === null ? (
        <div className="h-24 animate-pulse rounded-card bg-surface-sunken" />
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
          {t.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const tone = row.due_needs_confirmation
              ? "border-amber/50 bg-amber-soft text-amber-text"
              : row.due_basis === "prorogation"
                ? "border-navy/30 bg-navy-soft text-navy"
                : "border-teal/40 bg-teal-soft text-teal-text";
            const basis = row.due_needs_confirmation
              ? t.unconfirmed
              : row.due_basis === "prorogation"
                ? t.prorogued
                : t.statutory;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">
                    {names[row.taxpayer_id] ?? row.taxpayer_id}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {obligationLabel(row.obligation_code, locale)} · {row.period_token}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`tnum rounded-full border px-2 py-0.5 font-mono text-xs font-semibold ${tone}`}>
                    {row.due_on} · {basis}
                  </span>
                  <Link
                    href={`/${locale}/workspace/cases/${row.id}`}
                    className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text"
                  >
                    {t.openCase}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
