"use client";

import { useEffect, useState } from "react";
import { supabase, whenSignedIn } from "@/lib/supabase";

type Labels = {
  title: string; subtitle: string; empty: string; emptyHint: string;
  colTask: string; colClient: string; colState: string; colAssignee: string; colDue: string;
  unassigned: string; noDue: string; overdue: string; dueToday: string; daysLeft: string;
  blocking: string; stateOpen: string; stateDone: string;
  newTask: string; taskTitle: string; caseLabel: string; dueDate: string;
  create: string; creating: string; createFailed: string; chooseCase: string;
};

type Row = {
  task_id: string; title: string; state: string; due_on: string | null;
  days_to_due: number | null; assignee_label: string | null;
  obligation_code: string | null; period_token: string | null; is_blocking: boolean | null;
};
type CaseRow = { id: string; obligation_code: string | null; period_token: string | null };
type MemberRow = { id: string; person_label: string };

/**
 * The tasks board. Reading is open to every member; creating a task goes
 * through the same RLS that guards the table, so a member without case.advance
 * on that taxpayer is refused by the database rather than by the button.
 */
export function WorkTasks({ t }: { t: Labels }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [form, setForm] = useState({ caseId: "", title: "", dueOn: "", assigneeId: "" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadRows() {
    const { data, error } = await supabase()
      .from("firm_task_board")
      .select("task_id,title,state,due_on,days_to_due,assignee_label,obligation_code,period_token,is_blocking")
      .order("days_to_due", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) { setOffline(true); setRows([]); return; }
    setOffline(false);
    setRows((data ?? []) as Row[]);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      // A deep link carries the token in the hash; queries fired before the
      // client restores the session come back empty.
      await whenSignedIn();
      if (!active) return;
      await loadRows();
      const [c, m] = await Promise.all([
        supabase().from("compliance_cases").select("id,obligation_code,period_token").limit(200),
        supabase().from("firm_members").select("id,person_label").eq("active", true).limit(200),
      ]);
      if (!active) return;
      setCases((c.data ?? []) as CaseRow[]);
      setMembers((m.data ?? []) as MemberRow[]);
    })();
    return () => { active = false; };
  }, []);

  async function create() {
    if (!form.caseId || form.title.trim().length < 2) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase().from("case_tasks").insert({
      case_id: form.caseId,
      title: form.title.trim(),
      state: "open",
      due_on: form.dueOn || null,
      assignee_member_id: form.assigneeId || null,
    });
    setBusy(false);
    if (error) { setFailed(true); return; }
    setForm({ caseId: "", title: "", dueOn: "", assigneeId: "" });
    await loadRows();
  }

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

  const field = "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg";
  const label = "text-xs font-semibold uppercase tracking-wide text-fg-muted";

  const formBlock = (
    <div className="rounded-card border border-border bg-surface px-5 py-4">
      <h3 className="text-sm font-semibold text-fg">{t.newTask}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="task-case">{t.caseLabel}</label>
          <select id="task-case" className={field} value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })}>
            <option value="">{t.chooseCase}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>{c.obligation_code ?? "—"}{c.period_token ? ` · ${c.period_token}` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="task-title">{t.taskTitle}</label>
          <input id="task-title" className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="task-due">{t.dueDate}</label>
          <input id="task-due" type="date" className={field} value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="task-assignee">{t.colAssignee}</label>
          <select id="task-assignee" className={field} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
            <option value="">{t.unassigned}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.person_label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => void create()} disabled={busy || !form.caseId || form.title.trim().length < 2} className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface disabled:opacity-60">
          {busy ? t.creating : t.create}
        </button>
        {failed ? <span className="text-sm text-danger">{t.createFailed}</span> : null}
      </div>
    </div>
  );

  if (rows === null) return <div className="h-24" aria-hidden />;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {formBlock}
        <div className="rounded-card border border-border bg-surface px-5 py-8 text-center">
          <p className="text-sm font-semibold text-fg">{t.empty}</p>
          <p className="mt-1 text-sm text-fg-muted">{t.emptyHint}</p>
          {offline ? <p className="mt-2 text-xs text-amber-text">{t.subtitle}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {formBlock}
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
    </div>
  );
}
