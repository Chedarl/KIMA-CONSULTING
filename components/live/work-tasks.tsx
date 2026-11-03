"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Labels = {
  title: string; subtitle: string; empty: string; emptyHint: string;
  colTask: string; colClient: string; colState: string; colAssignee: string; colDue: string;
  unassigned: string; noDue: string; overdue: string; dueToday: string; daysLeft: string;
  blocking: string; stateOpen: string; stateDone: string;
};

type Row = {
  task_id: string;
  title: string;
  state: string;
  due_on: string | null;
  days_to_due: number | null;
  assignee_label: string | null;
  obligation_code: string | null;
  period_token: string | null;
  is_blocking: boolean | null;
};

/**
 * The tasks board — one row per open task, ordered by what is closest to being
 * late. Read-only in this slice: assignment and creation come next, so nothing
 * here can write.
 */
export function WorkTasks({ t }: { t: Labels }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase()
          .from("firm_task_board")
          .select("task_id,title,state,due_on,days_to_due,assignee_label,obligation_code,period_token,is_blocking")
          .order("days_to_due", { ascending: true, nullsFirst: false })
          .limit(200);
        if (!active) return;
        if (error) { setOffline(true); setRows([]); return; }
        setRows((data ?? []) as Row[]);
      } catch {
        if (active) { setOffline(true); setRows([]); }
      }
    })();
    return () => { active = false; };
  }, []);

  function due(r: Row) {
    if (!r.due_on) return <span className="text-fg-muted">{t.noDue}</span>;
    const d = r.days_to_due;
    const tone = d === null ? "" : d < 0 ? "text-danger" : d <= 3 ? "text-amber-text" : "text-fg-muted";
    const label = d === null ? "" : d < 0 ? t.overdue : d === 0 ? t.dueToday : `${d} ${t.daysLeft}`;
    return (
      <span className={tone}>
        {r.due_on}
        {label ? <span className="ml-2 text-xs">{label}</span> : null}
      </span>
    );
  }

  if (rows === null) return <div className="h-24" aria-hidden />;

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface px-5 py-8 text-center">
        <p className="text-sm font-semibold text-fg">{t.empty}</p>
        <p className="mt-1 text-sm text-fg-muted">{t.emptyHint}</p>
        {offline ? <p className="mt-2 text-xs text-amber-text">{t.subtitle}</p> : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-fg-muted">
          <tr>
            <th className="px-4 py-3">{t.colTask}</th>
            <th className="px-4 py-3">{t.colClient}</th>
            <th className="px-4 py-3">{t.colState}</th>
            <th className="px-4 py-3">{t.colAssignee}</th>
            <th className="px-4 py-3">{t.colDue}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.task_id} className="border-t border-border">
              <td className="px-4 py-3">
                {r.title}
                {r.is_blocking ? <span className="ml-2 rounded-full bg-amber-soft px-2 py-0.5 text-xs text-amber-text">{t.blocking}</span> : null}
              </td>
              <td className="px-4 py-3 text-fg-muted">
                {r.obligation_code ?? "—"}{r.period_token ? ` · ${r.period_token}` : ""}
              </td>
              <td className="px-4 py-3">{r.state === "done" ? t.stateDone : t.stateOpen}</td>
              <td className="px-4 py-3 text-fg-muted">{r.assignee_label ?? t.unassigned}</td>
              <td className="px-4 py-3">{due(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
