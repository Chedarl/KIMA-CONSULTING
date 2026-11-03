"use client";

import { useEffect, useState } from "react";
import { supabase, whenSignedIn } from "@/lib/supabase";

type Labels = {
  title: string; subtitle: string; empty: string; emptyHint: string;
  colType: string; colStatus: string; colPayment: string; colAmount: string; colObserved: string;
  typePaymentStepError: string; typeDebitNotRecognised: string; typeCertificateBlocked: string;
  statusOpen: string; statusEscalated: string; statusAwaiting: string; statusResolved: string; statusClosedUnresolved: string;
  paymentUnknown: string; paymentAttempted: string; paymentDebitObserved: string;
  paymentReferenceRecorded: string; paymentVerified: string; paymentDisputed: string; paymentNotApplicable: string;
  maskedReference: string;
  newIncident: string; taxpayer: string; chooseTaxpayer: string; observedOn: string;
  amount: string; reportedError: string; createIncident: string; creatingIncident: string; createIncidentFailed: string;
};

type Row = {
  id: string; type: string; status: string; payment_state: string;
  observed_at: string; amount_minor: number | null; reference_masked: string | null;
};
type Taxpayer = { id: string; legal_name: string };

/**
 * The incident register, and the one write that opens it.
 *
 * Recording an incident names no reviewer and claims no verification: the row
 * lands as `open` with the payment dimension at `debit_observed`, and the
 * database refuses `verified` unless a named reviewer cites official evidence.
 * The trigger writes the first timeline entry, so the history exists from the
 * moment the incident does.
 */
export function IncidentList({ t }: { t: Labels }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [taxpayers, setTaxpayers] = useState<Taxpayer[]>([]);
  const [form, setForm] = useState({ taxpayerId: "", type: "debit_not_recognised", observedOn: "", amount: "", error: "" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadRows() {
    const { data } = await supabase()
      .from("payment_incidents")
      .select("id,type,status,payment_state,observed_at,amount_minor,reference_masked")
      .order("observed_at", { ascending: false })
      .limit(100);
    setRows(((data ?? []) as Row[]).map((r) => r));
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      await whenSignedIn();
      if (!alive) return;
      await loadRows();
      const { data } = await supabase().from("taxpayers").select("id,legal_name").limit(200);
      if (alive) setTaxpayers((data ?? []) as Taxpayer[]);
    })();
    return () => { alive = false; };
  }, []);

  async function create() {
    if (!form.taxpayerId) return;
    setBusy(true);
    setFailed(false);
    const amount = form.amount.trim() ? Number(form.amount.replace(/[^0-9]/g, "")) : null;
    const { error } = await supabase().from("payment_incidents").insert({
      taxpayer_id: form.taxpayerId,
      reported_by: "firm",
      type: form.type,
      observed_at: form.observedOn ? new Date(form.observedOn).toISOString() : new Date().toISOString(),
      amount_minor: amount && Number.isFinite(amount) ? amount : null,
      payment_state: "debit_observed",
      reported_error: form.error.trim() || null,
    });
    setBusy(false);
    if (error) { setFailed(true); return; }
    setForm({ taxpayerId: "", type: "debit_not_recognised", observedOn: "", amount: "", error: "" });
    await loadRows();
  }

  const field = "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg";
  const label = "text-xs font-semibold uppercase tracking-wide text-fg-muted";

  const formBlock = (
    <div className="rounded-card border border-border bg-surface px-5 py-4">
      <h3 className="text-sm font-semibold text-fg">{t.newIncident}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="inc-taxpayer">{t.taxpayer}</label>
          <select id="inc-taxpayer" className={field} value={form.taxpayerId} onChange={(e) => setForm({ ...form, taxpayerId: e.target.value })}>
            <option value="">{t.chooseTaxpayer}</option>
            {taxpayers.map((p) => <option key={p.id} value={p.id}>{p.legal_name}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="inc-type">{t.colType}</label>
          <select id="inc-type" className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="payment_step_error">{t.typePaymentStepError}</option>
            <option value="debit_not_recognised">{t.typeDebitNotRecognised}</option>
            <option value="certificate_blocked">{t.typeCertificateBlocked}</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="inc-observed">{t.observedOn}</label>
          <input id="inc-observed" type="date" className={field} value={form.observedOn} onChange={(e) => setForm({ ...form, observedOn: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="inc-amount">{t.amount}</label>
          <input id="inc-amount" inputMode="numeric" className={field} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className={label} htmlFor="inc-error">{t.reportedError}</label>
          <input id="inc-error" className={field} value={form.error} onChange={(e) => setForm({ ...form, error: e.target.value })} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => void create()} disabled={busy || !form.taxpayerId} className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface disabled:opacity-60">
          {busy ? t.creatingIncident : t.createIncident}
        </button>
        {failed ? <span className="text-sm text-danger">{t.createIncidentFailed}</span> : null}
      </div>
    </div>
  );

  if (rows === null) return <div className="h-24" aria-hidden />;

  const typeLabel: Record<string, string> = {
    payment_step_error: t.typePaymentStepError,
    debit_not_recognised: t.typeDebitNotRecognised,
    certificate_blocked: t.typeCertificateBlocked,
  };
  const statusLabel: Record<string, string> = {
    open: t.statusOpen, escalated: t.statusEscalated, awaiting_administration: t.statusAwaiting,
    resolved: t.statusResolved, closed_unresolved: t.statusClosedUnresolved,
  };
  const paymentLabel: Record<string, string> = {
    unknown: t.paymentUnknown, attempted: t.paymentAttempted, debit_observed: t.paymentDebitObserved,
    reference_recorded: t.paymentReferenceRecorded, verified: t.paymentVerified,
    disputed: t.paymentDisputed, not_applicable: t.paymentNotApplicable,
  };

  return (
    <div className="flex flex-col gap-4">
      {formBlock}
      {rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface px-5 py-8 text-center">
          <p className="text-sm font-semibold text-fg">{t.empty}</p>
          <p className="mt-1 text-sm text-fg-muted">{t.emptyHint}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3">{t.colType}</th>
                <th className="px-4 py-3">{t.colStatus}</th>
                <th className="px-4 py-3">{t.colPayment}</th>
                <th className="px-4 py-3">{t.colAmount}</th>
                <th className="px-4 py-3">{t.colObserved}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    {typeLabel[r.type] ?? r.type}
                    {r.reference_masked ? <span className="ml-2 text-xs text-fg-muted">{t.maskedReference}: {r.reference_masked}</span> : null}
                  </td>
                  <td className="px-4 py-3">{statusLabel[r.status] ?? r.status}</td>
                  <td className="px-4 py-3">{paymentLabel[r.payment_state] ?? r.payment_state}</td>
                  <td className="px-4 py-3">{r.amount_minor === null ? "—" : `${r.amount_minor.toLocaleString("fr-FR")} XAF`}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.observed_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
