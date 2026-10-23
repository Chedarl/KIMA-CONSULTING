"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePortalCopy } from "@/components/client-portal/copy";
import { EmptyState, formatDay, LoadingRows, OfflineNote, PageHeading, Pill } from "@/components/client-portal/ui";
import { awaitingClient, clientStatus, obligationLabel, requestIsOutstanding, waitsOn, type CaseRequest, type ComplianceCase } from "@/lib/cases";
import { todayInDouala } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

type Item = {
  id: string;
  date: string;
  title: string;
  href: string;
  action: boolean;
  provisional: boolean;
};

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_FR = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

/**
 * Client deadlines only: open cases and documents still owed by the client.
 * Dates that the rules have not confirmed stay amber.
 */
export function CalendarBoard({ locale }: { locale: "fr" | "en" }) {
  const copy = usePortalCopy();
  const [items, setItems] = useState<Item[] | null>(null);
  const [offline, setOffline] = useState(false);
  const today = todayInDouala();
  const [cursor, setCursor] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(today);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [cs, rq] = await Promise.all([
        db
          .from("compliance_cases")
          .select("id, obligation_code, period_token, due_on, due_needs_confirmation, stage, closed_at, filing_status")
          .is("closed_at", null),
        db.from("document_requests").select("id, case_id, label_fr, label_en, status, responsible, due_on"),
      ]);
      if (cs.error) throw cs.error;
      const cases = (cs.data ?? []) as Pick<
        ComplianceCase,
        "id" | "obligation_code" | "period_token" | "due_on" | "due_needs_confirmation" | "stage" | "closed_at"
      >[];
      const requests = (rq.data ?? []) as Pick<CaseRequest, "id" | "case_id" | "label_fr" | "label_en" | "status" | "responsible" | "due_on">[];
      const byCase: Record<string, CaseRequest[]> = {};
      for (const r of requests) {
        if (!r.case_id) continue;
        (byCase[r.case_id] ??= []).push(r as CaseRequest);
      }
      const next: Item[] = [];
      for (const c of cases) {
        if (!c.due_on) continue;
        const status = clientStatus(c as ComplianceCase, awaitingClient(byCase[c.id] ?? []));
        next.push({
          id: c.id,
          date: c.due_on,
          title: `${obligationLabel(c.obligation_code, locale)} · ${c.period_token}`,
          href: `/${locale}/app/declarations/${c.id}`,
          action: status === "waiting_on_you",
          provisional: c.due_needs_confirmation,
        });
      }
      for (const r of requests) {
        if (!(requestIsOutstanding(r.status) && waitsOn(r) === "client")) continue;
        next.push({
          id: r.id,
          date: r.due_on,
          title: locale === "fr" ? r.label_fr : r.label_en,
          href: `/${locale}/app/requests`,
          action: true,
          provisional: false,
        });
      }
      setItems(next);
      setOffline(false);
    } catch {
      setOffline(true);
      setItems([]);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const [year, month] = cursor.split("-").map(Number);
  const grid = useMemo(() => {
    const first = new Date(Date.UTC(year!, month! - 1, 1, 12));
    const startPad = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year!, month!, 0, 12)).getUTCDate();
    const cells: ({ iso: string; day: number } | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ iso, day: d });
    }
    return cells;
  }, [year, month]);

  const byDate = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const item of items ?? []) {
      (map[item.date] ??= []).push(item);
    }
    return map;
  }, [items]);

  const upcoming = (items ?? [])
    .filter((i) => i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const monthLabel = new Intl.DateTimeFormat(locale === "fr" ? "fr-CM" : "en-CM", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Douala",
  }).format(new Date(Date.UTC(year!, month! - 1, 1, 12)));

  function shift(delta: number) {
    const d = new Date(Date.UTC(year!, month! - 1 + delta, 1, 12));
    setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const week = locale === "fr" ? WEEK_FR : WEEK;
  const dayItems = selected ? byDate[selected] ?? [] : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={copy.calendarTitle} />
      {offline && <OfflineNote>{copy.offline}</OfflineNote>}
      {items === null ? (
        <LoadingRows label={copy.loading} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.8fr)]">
          <section className="rounded-card border border-border bg-white p-4 shadow-card sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold capitalize text-fg">{monthLabel}</h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => shift(-1)} className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-sunken" aria-label={copy.prevMonth}>
                  ‹
                </button>
                <button type="button" onClick={() => shift(1)} className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-sunken" aria-label={copy.nextMonth}>
                  ›
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-fg-muted">
              {week.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((cell, i) => {
                if (!cell) return <div key={`e-${i}`} />;
                const marks = byDate[cell.iso] ?? [];
                const action = marks.some((m) => m.action || m.provisional);
                const on = selected === cell.iso;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelected(cell.iso)}
                    aria-pressed={on}
                    className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg text-sm hover:bg-surface-sunken ${
                      on ? "bg-navy-soft font-semibold text-fg" : "text-fg"
                    } ${cell.iso === today ? "ring-2 ring-teal/50" : ""}`}
                  >
                    {cell.day}
                    {marks.length > 0 && (
                      <span aria-hidden className={`mt-1 h-1.5 w-1.5 rounded-full ${action ? "bg-amber" : "bg-teal"}`} />
                    )}
                  </button>
                );
              })}
            </div>
            {selected && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-sm font-semibold text-fg">
                  {copy.openDay} {selected}
                </p>
                {dayItems.length === 0 ? (
                  <p className="mt-1 text-sm text-fg-muted">{copy.nothingThatDay}</p>
                ) : (
                  <ul className="mt-2 flex flex-col">
                    {dayItems.map((item) => (
                      <li key={item.id}>
                        <Link href={item.href} className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg px-1 hover:bg-surface-sunken">
                          <span className="text-sm text-fg">{item.title}</span>
                          {item.action && <Pill tone="amber">{copy.badgeAction}</Pill>}
                          {item.provisional && !item.action && <Pill tone="amber-outline">{copy.provisional}</Pill>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="rounded-card border border-border bg-white p-5 shadow-card">
            <h2 className="font-display text-base font-semibold text-fg">{copy.upcoming}</h2>
            {upcoming.length === 0 ? (
              <div className="mt-4">
                <EmptyState title={copy.noUpcoming} hint={copy.noUpcomingHint} />
              </div>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-border">
                {upcoming.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="flex min-h-[56px] items-center justify-between gap-3 py-2 hover:text-teal-text">
                      <span>
                        <span className="tnum block text-sm font-semibold text-fg">{formatDay(item.date, locale)}</span>
                        <span className="block text-sm text-fg-muted">{item.title}</span>
                      </span>
                      {item.action ? <Pill tone="amber">{copy.badgeAction}</Pill> : <span aria-hidden className="h-2 w-2 rounded-full bg-teal" />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
