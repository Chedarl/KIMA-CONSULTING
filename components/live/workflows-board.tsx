"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { obligationLabel, stageLabel, type CaseStage } from "@/lib/cases";

type Row = { id: string; taxpayer_id: string; obligation_code: string; period_token: string; stage: CaseStage; due_on: string | null; closed_at: string | null; owner: string | null };
type C = { [k: string]: string };

const FLOW: CaseStage[] = ["documents", "accounting", "preparation", "review", "filing", "evidence", "client_approval", "delivered"];

// Four status columns, mapped from the eight Kima stages.
const BUCKETS: { key: string; labelKey: string; stages: CaseStage[] }[] = [
  { key: "todo", labelKey: "colTodo", stages: ["documents", "accounting"] },
  { key: "doing", labelKey: "colDoing", stages: ["preparation"] },
  { key: "review", labelKey: "colReview", stages: ["review"] },
  { key: "done", labelKey: "colDone", stages: ["filing", "evidence", "client_approval", "delivered"] },
];

const progress = (stage: CaseStage) => {
  const i = FLOW.indexOf(stage);
  return i < 0 ? 0 : Math.round(((i + 1) / FLOW.length) * 100);
};

export function WorkflowsBoard({ locale, t }: { locale: "fr" | "en"; t: C }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [view, setView] = useState<"kanban" | "list" | "calendar" | "models" | "automations">("kanban");
  const [owner, setOwner] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = supabase();
      const [cs, tp] = await Promise.all([
        db.from("compliance_cases").select("id, taxpayer_id, obligation_code, period_token, stage, due_on, closed_at, owner").is("closed_at", null).order("due_on", { ascending: true }),
        db.from("taxpayers").select("id, legal_name"),
      ]);
      if (!alive) return;
      setRows((cs.data ?? []) as Row[]);
      const m: Record<string, string> = {};
      for (const x of (tp.data ?? []) as { id: string; legal_name: string }[]) m[x.id] = x.legal_name;
      setNames(m);
    })();
    return () => { alive = false; };
  }, []);

  const owners = useMemo(() => [...new Set((rows ?? []).map((r) => r.owner).filter(Boolean))] as string[], [rows]);
  const filtered = useMemo(() => (owner ? (rows ?? []).filter((r) => r.owner === owner) : rows ?? []), [rows, owner]);
  const grouped = useMemo(() => BUCKETS.map((b) => ({ ...b, cases: filtered.filter((r) => b.stages.includes(r.stage)) })), [filtered]);

  const name = (r: Row) => names[r.taxpayer_id] ?? r.taxpayer_id.slice(0, 8);

  const Card = ({ r }: { r: Row }) => (
    <Link href={`/${locale}/workspace/cases/${r.id}`} className="block rounded-lg border border-border bg-surface px-3 py-2 transition hover:border-teal/40 hover:shadow-card">
      <p className="truncate text-sm font-semibold text-fg">{name(r)}</p>
      <p className="mt-0.5 truncate text-xs text-fg-muted">{obligationLabel(r.obligation_code, locale)} · {r.period_token}</p>
      <p className="mt-1 flex items-center gap-2 text-[11px] text-fg-subtle">
        <span className="tnum font-mono">{r.due_on?.slice(0, 10) ?? "—"}</span>
        {r.owner ? <span className="truncate">{r.owner}</span> : null}
        <span aria-hidden className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[9px] font-bold text-fg-muted">{(r.owner ?? "—").slice(0, 2).toUpperCase()}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full rounded-full bg-teal" style={{ width: progress(r.stage) + "%" }} />
      </div>
      <p className="mt-1 text-right text-[10px] text-fg-subtle">{progress(r.stage)}%</p>
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t.title} className="flex flex-wrap rounded-lg border border-border p-0.5">
          {[["kanban", t.kanban], ["list", t.list], ["calendar", t.calendar], ["models", t.models], ["automations", t.automations]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id as typeof view)} className={"inline-flex min-h-[36px] items-center rounded-md px-3 text-xs font-semibold " + (view === id ? "bg-surface-sunken text-fg" : "text-fg-muted hover:text-fg")}>{label}</button>
          ))}
        </div>
        <Link href={`/${locale}/workspace/templates`} className="inline-flex min-h-[40px] items-center rounded-lg bg-[#18243B] px-3 text-sm font-semibold text-white hover:bg-[#24314d]">+ {t.newWorkflow}</Link>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm text-fg">
          <option value="">{t.allOwners}</option>
          {owners.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
        <span className="ml-auto text-xs text-fg-subtle">{filtered.length} {t.count}</span>
      </div>

      {rows === null ? (
        <p className="text-sm text-fg-muted">{t.loading}</p>
) : view === "calendar" ? (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <p className="text-sm text-fg-muted">{t.calendarHint}</p>
          <Link href={`/${locale}/workspace/calendar`} className="inline-flex min-h-[44px] w-fit items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">{t.openCalendar}</Link>
        </div>
) : view === "models" ? (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <p className="text-sm text-fg-muted">{t.modelsHint}</p>
          <Link href={`/${locale}/workspace/templates`} className="inline-flex min-h-[44px] w-fit items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">{t.openModels}</Link>
        </div>
) : view === "automations" ? (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <p className="text-sm text-fg-muted">{t.automationsHint}</p>
          <Link href={`/${locale}/workspace/templates`} className="inline-flex min-h-[44px] w-fit items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">{t.openModels}</Link>
        </div>
) : view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {grouped.map((b) => (
            <section key={b.key} className="flex w-[16rem] shrink-0 flex-col gap-2 rounded-xl border border-border bg-surface-sunken/60 p-2.5">
              <header className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t[b.labelKey]}</h3>
                <span className="tnum rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] text-fg-muted">{b.cases.length}</span>
              </header>
              {b.cases.length === 0 ? <p className="px-1 py-2 text-[11px] text-fg-subtle">{t.empty}</p> : b.cases.slice(0, 6).map((r) => <Card key={r.id} r={r} />)}
            </section>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link href={`/${locale}/workspace/cases/${r.id}`} className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 text-sm hover:border-teal/40">
                <span className="min-w-0 truncate font-medium text-fg">{name(r)}</span>
                <span className="shrink-0 text-xs text-fg-muted">{stageLabel(r.stage, locale)} · {obligationLabel(r.obligation_code, locale)}</span>
                <span className="w-24 shrink-0"><span className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken"><span className="block h-full rounded-full bg-teal" style={{ width: progress(r.stage) + "%" }} /></span></span>
                <span className="tnum w-10 shrink-0 text-right font-mono text-xs text-fg-subtle">{r.due_on?.slice(0, 10) ?? "—"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
