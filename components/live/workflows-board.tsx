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
  const [view, setView] = useState<"kanban" | "list">("kanban");
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
        <div role="group" aria-label={t.title} className="flex rounded-lg border border-border p-0.5">
          <button type="button" onClick={() => setView("kanban")} className={"inline-flex min-h-[36px] items-center rounded-md px-3 text-xs font-semibold " + (view === "kanban" ? "bg-surface-sunken text-fg" : "text-fg-muted")}>{t.kanban}</button>
          <button type="button" onClick={() => setView("list")} className={"inline-flex min-h-[36px] items-center rounded-md px-3 text-xs font-semibold " + (view === "list" ? "bg-surface-sunken text-fg" : "text-fg-muted")}>{t.list}</button>
        </div>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm text-fg">
          <option value="">{t.allOwners}</option>
          {owners.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
        <span className="ml-auto text-xs text-fg-subtle">{filtered.length} {t.count}</span>
      </div>

      {rows === null ? (
        <p className="text-sm text-fg-muted">{t.loading}</p>
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
