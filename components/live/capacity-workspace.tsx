"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PageHeading } from "@/components/ui";

type Row = { id: string; owner: string | null; due_on: string | null; stage: string };
type Entry = { minutes: number; worked_on: string };

export function CapacityWorkspace({ locale }: { locale: "fr" | "en" }) {
  const L = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [time, setTime] = useState<Entry[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = supabase();
      const [cs, te] = await Promise.all([
        db.from("compliance_cases").select("id, owner, due_on, stage").is("closed_at", null),
        db.from("time_entries").select("minutes, worked_on").gte("worked_on", new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)),
      ]);
      if (!alive) return;
      setRows((cs.data ?? []) as Row[]);
      setTime((te.data ?? []) as Entry[]);
    })();
    return () => { alive = false; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const inDays = (n: number) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  const kpi = useMemo(() => {
    const open = rows ?? [];
    const owners = new Set(open.map((r) => r.owner ?? L("Non attribué", "Unassigned")));
    const week = open.filter((r) => r.due_on && r.due_on >= today && r.due_on <= inDays(7)).length;
    const mins = time.reduce((s, t) => s + t.minutes, 0);
    return { owners: owners.size, open: open.length, week, hours: Math.round(mins / 6) / 10 };
  }, [rows, time, today]);

  const byOwner = useMemo(() => {
    const map = new Map<string, { open: number; week: number }>();
    for (const r of rows ?? []) {
      const k = r.owner ?? L("Non attribué", "Unassigned");
      const cur = map.get(k) ?? { open: 0, week: 0 };
      cur.open += 1;
      if (r.due_on && r.due_on >= today && r.due_on <= inDays(7)) cur.week += 1;
      map.set(k, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].open - a[1].open);
  }, [rows, today]);

  const heat = useMemo(() => {
    const days: { day: string; count: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const day = inDays(i);
      days.push({ day, count: (rows ?? []).filter((r) => r.due_on === day).length });
    }
    return days;
  }, [rows, today]);
  const maxHeat = Math.max(1, ...heat.map((h) => h.count));
  const maxLoad = Math.max(1, ...byOwner.map(([, v]) => v.open));

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={L("Capacité et échéances", "Capacity and deadlines")} lede={L("La charge par responsable et les échéances des quatorze prochains jours.", "The load per owner and the deadlines for the next fourteen days.")} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-card border border-border bg-surface p-4"><p className="tnum font-display text-2xl font-semibold text-fg">{kpi.owners}</p><p className="mt-1 text-xs text-fg-muted">{L("Responsables", "Owners")}</p></div>
        <div className="rounded-card border border-border bg-surface p-4"><p className="tnum font-display text-2xl font-semibold text-fg">{kpi.open}</p><p className="mt-1 text-xs text-fg-muted">{L("Dossiers ouverts", "Open cases")}</p></div>
        <div className="rounded-card border border-border bg-surface p-4"><p className="tnum font-display text-2xl font-semibold text-amber-text">{kpi.week}</p><p className="mt-1 text-xs text-fg-muted">{L("Échéances sous 7 jours", "Due within 7 days")}</p></div>
        <div className="rounded-card border border-border bg-surface p-4"><p className="tnum font-display text-2xl font-semibold text-teal-text">{kpi.hours} h</p><p className="mt-1 text-xs text-fg-muted">{L("Heures saisies (4 semaines)", "Hours logged (4 weeks)")}</p></div>
      </div>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{L("Charge par responsable", "Load per owner")}</h2>
        {rows === null ? <p className="mt-3 text-sm text-fg-muted">{L("Chargement…", "Loading…")}</p> : byOwner.length === 0 ? <p className="mt-3 text-sm text-fg-muted">{L("Aucun dossier ouvert.", "No open case.")}</p> : (
          <ul className="mt-3 flex flex-col gap-3">
            {byOwner.map(([name, v]) => (
              <li key={name}>
                <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium text-fg">{name}</span><span className="tnum shrink-0 text-xs text-fg-muted">{v.open} · {v.week} {L("sous 7 j", "within 7 d")}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-teal" style={{ width: Math.round((v.open / maxLoad) * 100) + "%" }} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{L("Échéances des 14 prochains jours", "Deadlines in the next 14 days")}</h2>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {heat.map((h) => (
            <div key={h.day} title={h.day + " · " + h.count} className="flex flex-col items-center gap-1">
              <span aria-hidden className="block h-10 w-full rounded-md" style={{ backgroundColor: "rgb(var(--teal) / " + (0.08 + (h.count / maxHeat) * 0.62) + ")" }} />
              <span className="tnum text-[10px] text-fg-subtle">{h.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      <Link href={`/${locale}/workspace/workflows`} className="inline-flex min-h-[44px] w-fit items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">{L("Ouvrir les workflows", "Open workflows")}</Link>
    </div>
  );
}
