"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Labels = {
  title: string; subtitle: string; empty: string; emptyHint: string;
  colType: string; colStatus: string; colPayment: string; colAmount: string; colObserved: string;
  typePaymentStepError: string; typeDebitNotRecognised: string; typeCertificateBlocked: string;
  statusOpen: string; statusEscalated: string; statusAwaiting: string; statusResolved: string; statusClosedUnresolved: string;
  paymentUnknown: string; paymentAttempted: string; paymentDebitObserved: string;
  paymentReferenceRecorded: string; paymentVerified: string; paymentDisputed: string; paymentNotApplicable: string;
  maskedReference: string;
};

type Row = {
  id: string; type: string; status: string; payment_state: string;
  observed_at: string; amount_minor: number | null; reference_masked: string | null;
};

/**
 * Payment incidents, read-only for now. The verification rule lives in the
 * database (no debit reaches 'verified' without a named reviewer and official
 * evidence), so this screen shows state rather than deciding it.
 */
export function IncidentList({ t }: { t: Labels }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase()
        .from("payment_incidents")
        .select("id,type,status,payment_state,observed_at,amount_minor,reference_masked")
        .order("observed_at", { ascending: false })
        .limit(100);
      if (alive) setRows((data ?? []) as Row[]);
    })();
    return () => { alive = false; };
  }, []);

  if (rows === null) return <div className="h-24 rounded-card border border-border bg-surface" aria-hidden />;

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface px-5 py-8 text-center">
        <p className="text-sm font-semibold text-fg">{t.empty}</p>
        <p className="mt-1 text-sm text-fg-muted">{t.emptyHint}</p>
      </div>
    );
  }

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
  );
}
