"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { stageLabel, type CaseStage } from "@/lib/cases";
import { PageHeading } from "@/components/ui";

const STAGES: CaseStage[] = ["documents", "accounting", "preparation", "review", "filing", "evidence", "client_approval", "delivered"];

type Row = { id: string; name: string; kind: string; services: string[]; stage_flow: string[]; letter: any };
type C = { [k: string]: string };

export function TemplatesWorkspace({ locale, t }: { locale: "fr" | "en"; t: C }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [services, setServices] = useState("");
  const [stages, setStages] = useState<string[]>(["documents", "preparation", "review", "filing"]);
  const [scope, setScope] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [showForm, setShowForm] = useState(false);
  const [clients, setClients] = useState<{ id: string; legal_name: string }[]>([]);
  const [applyId, setApplyId] = useState<string | null>(null);
  const [applyClient, setApplyClient] = useState("");
  const [applyStatus, setApplyStatus] = useState<"idle" | "applied" | "failed">("idle");

  async function load() {
    const db = supabase();
    const [tpl, tps] = await Promise.all([
      db.from("engagement_templates").select("id, name, kind, services, stage_flow, letter").order("name"),
      db.from("taxpayers").select("id, legal_name").order("legal_name"),
    ]);
    setRows((tpl.data ?? []) as Row[]);
    setClients((tps.data ?? []) as { id: string; legal_name: string }[]);
  }

  useEffect(() => { void load(); }, []);

  function toggle(s: string) {
    setStages((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  function startEdit(r: Row) {
    setEditId(r.id); setName(r.name); setServices((r.services ?? []).join(", "));
    setStages(r.stage_flow ?? []); setScope(r.letter?.scope ?? ""); setShowForm(true);
  }

  async function duplicate(r: Row) {
    await supabase().rpc("upsert_engagement_template", { p_id: null, p_name: r.name + " (copie)", p_services: r.services ?? [], p_stage_flow: r.stage_flow ?? [], p_letter: r.letter ?? {} });
    await load();
  }

  async function apply(r: Row) {
    if (!applyClient) return;
    setApplyStatus("idle");
    const { error } = await supabase().rpc("instantiate_engagement_template", { p_template: r.id, p_taxpayer: applyClient });
    setApplyStatus(error ? "failed" : "applied");
    if (!error) { setApplyId(null); setApplyClient(""); await load(); }
  }

  async function save() {
    if (!name.trim()) return;
    setStatus("saving");
    const svc = services.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase().rpc("upsert_engagement_template", { p_id: editId, p_name: name, p_services: svc, p_stage_flow: stages, p_letter: { scope } });
    setStatus(error ? "failed" : "saved");
    if (!error) { setShowForm(false); setEditId(null); setName(""); setServices(""); setScope(""); await load(); }
  }

  const input = "min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-teal/40";

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t.title} lede={t.subtitle} actions={<button type="button" onClick={() => { setShowForm((v) => !v); setEditId(null); setName(""); setServices(""); setStages(["documents", "preparation", "review", "filing"]); setScope(""); }} className="inline-flex min-h-[44px] items-center rounded-lg bg-[#18243B] px-4 text-sm font-semibold text-white hover:bg-[#24314d]">{t.new}</button>} />

      {showForm && (
        <section className="rounded-card border border-border bg-surface p-5">
          <label className="text-sm font-semibold text-fg">{t.name}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-2`} />
          <label className="mt-4 block text-sm font-semibold text-fg">{t.services}</label>
          <input value={services} onChange={(e) => setServices(e.target.value)} placeholder="dsf, tax, payroll" className={`${input} mt-2`} />
          <label className="mt-4 block text-sm font-semibold text-fg">{t.stages}</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <button key={s} type="button" onClick={() => toggle(s)} className={"inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-medium " + (stages.includes(s) ? "border-teal/40 bg-surface-sunken text-fg" : "border-border text-fg-muted")}>{stageLabel(s, locale)}</button>
            ))}
          </div>
          <label className="mt-4 block text-sm font-semibold text-fg">{t.scope}</label>
          <input value={scope} onChange={(e) => setScope(e.target.value)} className={`${input} mt-2`} />
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={save} disabled={status === "saving"} className="inline-flex min-h-[44px] items-center rounded-lg bg-[#18243B] px-5 text-sm font-semibold text-white hover:bg-[#24314d] disabled:opacity-50">{t.save}</button>
            {status === "saved" && <span className="text-sm text-success-text">{t.saved}</span>}
            {status === "failed" && <span className="text-sm text-danger-text">{t.failed}</span>}
          </div>
        </section>
      )}

      <ul className="flex flex-col gap-2">
        {rows.length === 0 ? <li className="text-sm text-fg-muted">{t.noTemplates}</li> : rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-fg">{r.name}</p>
              <p className="text-xs text-fg-muted">{r.kind === "inbuilt" ? t.inbuilt : t.firm} · {(r.services ?? []).join(", ")} · {t.stages + ": " + (r.stage_flow ?? []).length}</p>
            </div>
            <div className="flex items-center gap-2">
              {r.kind === "inbuilt" ? (
                <button type="button" onClick={() => duplicate(r)} className="min-h-[40px] rounded-lg border border-border px-3 text-sm font-semibold text-fg hover:bg-surface-sunken">{t.duplicate}</button>
              ) : (
                <>
                  <button type="button" onClick={() => { setApplyId(applyId === r.id ? null : r.id); setApplyStatus("idle"); }} className="min-h-[40px] rounded-lg border border-border px-3 text-sm font-semibold text-fg hover:bg-surface-sunken">{t.apply}</button>
                  <button type="button" onClick={() => startEdit(r)} className="min-h-[40px] rounded-lg border border-border px-3 text-sm font-semibold text-fg hover:bg-surface-sunken">{t.edit}</button>
                </>
              )}
            </div>
            {applyId === r.id ? (
              <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                <select value={applyClient} onChange={(e) => setApplyClient(e.target.value)} className="min-h-[40px] rounded-lg border border-border bg-surface px-2 text-sm text-fg">
                  <option value="">{t.applyTo}</option>
                  {clients.map((c) => (<option key={c.id} value={c.id}>{c.legal_name}</option>))}
                </select>
                <button type="button" onClick={() => apply(r)} disabled={!applyClient} className="min-h-[40px] rounded-lg bg-[#18243B] px-3 text-sm font-semibold text-white hover:bg-[#24314d] disabled:opacity-50">{t.apply}</button>
                {applyStatus === "applied" && <span className="text-sm text-success-text">{t.applied}</span>}
                {applyStatus === "failed" && <span className="text-sm text-danger-text">{t.applyFailed}</span>}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
