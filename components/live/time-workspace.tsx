"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeading } from "@/components/ui";

type C = { [k: string]: string };
type Entry = { id: string; taxpayer_id: string; case_id: string | null; member_id: string | null; minutes: number; kind: string; note: string | null; billable: boolean; worked_on: string };

export function TimeWorkspace({ locale }: { locale: "fr" | "en" }) {
  const L = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<{ id: string; legal_name: string }[]>([]);
  const [clientId, setClientId] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [kind, setKind] = useState("preparation");
  const [billable, setBillable] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  async function load() {
    const db = supabase();
    const [te, tp] = await Promise.all([
      db.from("time_entries").select("id, taxpayer_id, case_id, member_id, minutes, kind, note, billable, worked_on").order("worked_on", { ascending: false }).limit(200),
      db.from("taxpayers").select("id, legal_name").order("legal_name"),
    ]);
    setRows((te.data ?? []) as Entry[]);
    const list = (tp.data ?? []) as { id: string; legal_name: string }[];
    setClients(list);
    const m: Record<string, string> = {};
    for (const x of list) m[x.id] = x.legal_name;
    setNames(m);
  }

  useEffect(() => { void load(); }, []);

  const month = today.slice(0, 7);
  const kpi = useMemo(() => {
    const list = (rows ?? []).filter((r) => r.worked_on.slice(0, 7) === month);
    const mins = list.reduce((s, r) => s + r.minutes, 0);
    const bill = list.filter((r) => r.billable).reduce((s, r) => s + r.minutes, 0);
    return { hours: Math.round(mins / 6) / 10, billHours: Math.round(bill / 6) / 10, unbilled: Math.round((mins - bill) / 6) / 10, ratio: mins ? Math.round((bill / mins) * 100) : 0 };
  }, [rows, month]);

  async function add() {
    if (!clientId || !Number(minutes)) return;
    setBusy(true);
    const { error } = await supabase().rpc("record_time_entry", {
      p_taxpayer: clientId,
      p_minutes: Number(minutes),
      p_kind: kind,
      p_note: note.trim() || null,
      p_billable: billable,
      p_worked_on: today,
    });
    setMsg(error ? L("Le temps n’a pas été enregistré.", "The time was not recorded.") : L("Temps enregistré.", "Time recorded."));
    setBusy(false);
    if (!error) { setNote(""); setMinutes("30"); await load(); }
  }

  async function toggleBillable(r: Entry) {
    const { error } = await supabase().from("time_entries").update({ billable: !r.billable }).eq("id", r.id);
    if (!error) await load();
  }

  async function remove(r: Entry) {
    const { error } = await supabase().from("time_entries").delete().eq("id", r.id);
    if (!error) await load();
  }

  const input = "min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-teal/40";

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={L("Temps et rentabilité", "Time and profitability")} lede={L("Chaque minute saisie est rattachée à un client et à un dossier, facturable ou non.", "Every minute entered is attached to a client and a case, billable or not.")} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-card border border-border bg-surface p-4"><p className="tnum font-display text-2xl font-semibold text-fg">{kpi.hours} h</p><p className="mt-1 text-xs text-fg-muted">{L("Heures ce mois", "Hours this month")}</p></div>
        <div className="rounded-card border border-border bg-surface p-4"><p className="tnum font-display text-2xl font-semibold text-success-text">{kpi.billHours} h</p><p className="mt-1 text-xs text-fg-muted">{L("Heures facturables", "Billable hours")}</p></div>
        <div className="rounded-card border border-border bg-surface p-4"><p className="tnum font-display text-2xl font-semibold text-amber-text">{kpi.unbilled} h</p><p className="mt-1 text-xs text-fg-muted">{L("Non facturables", "Non-billable")}</p></div>
        <div className="rounded-card border border-border bg-surface p-4"><p className="tnum font-display text-2xl font-semibold text-fg">{kpi.ratio}%</p><p className="mt-1 text-xs text-fg-muted">{L("Taux de facturabilité", "Billable ratio")}</p></div>
      </div>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{L("Saisir du temps", "Enter time")}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">{L("Client", "Client")}
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
              <option value="">—</option>
              {clients.map((c) => (<option key={c.id} value={c.id}>{c.legal_name}</option>))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">{L("Minutes", "Minutes")}
            <input type="number" min={1} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${input} w-24`} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">{L("Type", "Kind")}
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
              <option value="preparation">{L("Production", "Production")}</option>
              <option value="review">{L("Revue", "Review")}</option>
              <option value="admin">{L("Administratif", "Admin")}</option>
            </select>
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-fg"><input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="h-4 w-4" />{L("Facturable", "Billable")}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L("Note", "Note")} className={`${input} min-w-[12rem] flex-1`} />
          <button type="button" onClick={() => void add()} disabled={busy || !clientId} className="inline-flex min-h-[44px] items-center rounded-lg bg-[#18243B] px-4 text-sm font-semibold text-white hover:bg-[#24314d] disabled:opacity-50">{L("Ajouter", "Add")}</button>
        </div>
        {msg ? <p className="mt-2 text-xs text-success-text">{msg}</p> : null}
      </section>

      <section className="rounded-card border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{L("Temps saisis", "Time entries")}</h2>
        {rows === null ? <p className="px-4 py-4 text-sm text-fg-muted">{L("Chargement…", "Loading…")}</p> : rows.length === 0 ? <p className="px-4 py-4 text-sm text-fg-muted">{L("Aucune saisie.", "No entry.")}</p> : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-fg">{names[r.taxpayer_id] ?? r.taxpayer_id.slice(0, 8)}</span><span className="block truncate text-xs text-fg-subtle">{r.kind} · {r.note ?? "—"} · {r.worked_on}</span></span>
                <span className="tnum shrink-0 font-mono text-sm text-fg">{(r.minutes / 60).toFixed(1)} h</span>
                <button type="button" onClick={() => void toggleBillable(r)} className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.billable ? "bg-success-soft text-success-text" : "bg-surface-sunken text-fg-muted"}`}>{r.billable ? L("Facturable", "Billable") : L("Non facturable", "Non-billable")}</button>
                <button type="button" onClick={() => void remove(r)} className="shrink-0 min-h-[32px] text-xs font-semibold text-danger-text hover:underline">{L("Supprimer", "Delete")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-fg-subtle">{L("La rentabilité en XAF demande des taux horaires par rôle ; KIMA affiche les heures et le taux de facturabilité tant que les taux ne sont pas saisis.", "XAF profitability needs hourly rates per role; KIMA shows hours and the billable ratio until rates are entered.")}</p>
    </div>
  );
}
