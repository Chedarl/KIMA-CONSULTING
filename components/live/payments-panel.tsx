"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { feePaymentState, ledgerBalance } from "@/lib/billing";
import { audit, sessionTaxpayerId, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { usePortalCopy } from "@/components/client-portal/copy";
import { EmptyState, FilterBar, PageHeading, Pill, PrimaryButton, xaf } from "@/components/client-portal/ui";
import { todayInDouala } from "@/lib/dates";

/**
 * Kima's service fees — NOT tax paid to the DGI. The two must never read as
 * the same thing, so the panel says which it is, and nothing here implies a
 * payment gateway.
 *
 * A client reports a payment they have already made elsewhere (MTN MoMo,
 * Orange Money, transfer, cash). Reporting is not confirming: the row lands as
 * `pending_confirmation`, the firm confirms it, and the database refuses a
 * confirmed row without a reference behind it — the same shape as filing
 * evidence.
 *
 * Amounts are whole francs. The input rejects anything that is not an integer
 * rather than silently rounding it.
 */
export type PaymentLabels = {
  invoices: string;
  history: string;
  issued: string;
  due: string;
  total: string;
  balance: string;
  paid: string;
  pending: string;
  record: string;
  amount: string;
  method: string;
  methods: Record<string, string>;
  reference: string;
  referenceHint: string;
  submit: string;
  submitting: string;
  recorded: string;
  failed: string;
  invalidAmount: string;
  overpay: string;
  needReference: string;
  noInvoices: string;
  notAGateway: string;
  statusPending: string;
  statusConfirmed: string;
  statusRejected: string;
  xaf: string;
  connecting: string;
  offline: string;
  live: string;
};

type Invoice = {
  id: string;
  number: string;
  description_fr: string;
  description_en: string;
  total_minor: number;
  status: string;
  organization_id: string;
  issued_on: string | null;
  due_on: string | null;
};

type Payment = {
  id: string;
  invoice_id: string;
  amount_minor: number;
  method: string;
  status: string;
  provider_reference: string | null;
  created_at: string;
};

const fmt = (minor: number, locale: "fr" | "en") =>
  new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM", {
    maximumFractionDigits: 0,
  }).format(minor);

export function PaymentsPanel({ locale, labels }: { locale: "fr" | "en"; labels: PaymentLabels }) {
  const toast = useToast();
  const copy = usePortalCopy();
  const [q, setQ] = useState("");
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ids, setIds] = useState<{ taxpayerId: string } | null>(null);
  const [error, setError] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mtn_momo");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      // The session's own taxpayer, never the oldest row (demoIds): a reported
      // payment is filed against it, under the invoice's own firm.
      const taxpayerId = await sessionTaxpayerId();
      const resolved = taxpayerId ? { taxpayerId } : null;
      if (!resolved) {
        setError(true);
        return;
      }
      setIds(resolved);
      const [{ data: inv }, { data: pay }] = await Promise.all([
        db
          .from("invoices")
          .select("*")
          .eq("taxpayer_id", resolved.taxpayerId)
          .neq("status", "draft")
          .order("due_on", { ascending: false }),
        db
          .from("service_payments")
          .select("*")
          .eq("taxpayer_id", resolved.taxpayerId)
          .order("created_at", { ascending: false }),
      ]);
      setInvoices((inv ?? []) as Invoice[]);
      setPayments((pay ?? []) as Payment[]);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Balances are derived, never stored: a stored balance drifts. */
  const balances = useMemo(() => {
    const out: Record<string, { confirmed: number; pending: number }> = {};
    for (const inv of invoices ?? []) out[inv.id] = ledgerBalance(payments, inv.id);
    return out;
  }, [invoices, payments]);

  async function report(invoice: Invoice) {
    if (!ids) return;
    if (!/^\d+$/.test(amount.trim())) {
      toast(labels.invalidAmount, "error");
      return;
    }
    const minor = Number.parseInt(amount.trim(), 10);
    const b = balances[invoice.id] ?? { confirmed: 0, pending: 0 };
    const outstanding = invoice.total_minor - b.confirmed - b.pending;
    if (minor <= 0) {
      toast(labels.invalidAmount, "error");
      return;
    }
    if (minor > outstanding) {
      toast(labels.overpay, "error");
      return;
    }
    if (method !== "cash" && reference.trim().length === 0) {
      toast(labels.needReference, "error");
      return;
    }

    setBusy(true);
    try {
      const db = supabase();
      const { error: e } = await db.from("service_payments").insert({
        invoice_id: invoice.id,
        taxpayer_id: ids.taxpayerId,
        organization_id: invoice.organization_id,
        amount_minor: minor,
        method,
        // The client reports; only the firm confirms.
        status: "pending_confirmation",
        provider_reference: reference.trim() || null,
        reported_by: "taxpayer",
      });
      if (e) throw e;

      const { recordCaseEvent } = await import("@/lib/record-event");
      await recordCaseEvent({
        taxpayerId: ids.taxpayerId,
        organizationId: invoice.organization_id,
        actor: { role: "client", label: "Client" },
        kind: "note_added",
        subject: invoice.number,
        reason: `Paiement signalé / Payment reported for invoice ${invoice.number}`,
      });
      await audit({
        taxpayerId: ids.taxpayerId,
        organizationId: invoice.organization_id,
        actor: "taxpayer",
        action: "payment.reported",
        resourceType: "invoice",
        resourceId: invoice.id,
        after: { amount_minor: minor, method },
      });

      toast(labels.recorded);
      setOpenFor(null);
      setAmount("");
      setReference("");
      await load();
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <p className="rounded-card border border-dashed border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
        {labels.offline}
      </p>
    );
  }
  if (invoices === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-24 rounded-card" />
        ))}
      </div>
    );
  }

  const year = todayInDouala().slice(0, 4);
  const outstandingTotal = invoices.reduce((sum, inv) => {
    const b = balances[inv.id] ?? { confirmed: 0, pending: 0 };
    return sum + Math.max(0, inv.total_minor - b.confirmed - b.pending);
  }, 0);
  const paidThisYear = payments
    .filter((p) => p.status === "confirmed" && p.created_at.slice(0, 4) === year)
    .reduce((sum, p) => sum + p.amount_minor, 0);
  const next = [...invoices]
    .filter((inv) => {
      const b = balances[inv.id] ?? { confirmed: 0, pending: 0 };
      return inv.due_on && inv.total_minor - b.confirmed - b.pending > 0;
    })
    .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))[0];
  const shown = invoices.filter((inv) => {
    const text = `${inv.number} ${inv.description_fr} ${inv.description_en}`.toLowerCase();
    return !q.trim() || text.includes(q.trim().toLowerCase());
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={copy.paymentsTitle} />
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-card border border-amber/30 bg-[#FFF8EC] p-5 shadow-card">
          <p className="text-sm text-fg-muted">{copy.outstanding}</p>
          <p className="tnum mt-2 font-display text-2xl font-semibold text-fg">{xaf(outstandingTotal, locale)}</p>
        </article>
        <article className="rounded-card border border-border bg-white p-5 shadow-card">
          <p className="text-sm text-fg-muted">{copy.paidYear}</p>
          <p className="tnum mt-2 font-display text-2xl font-semibold text-teal-text">{xaf(paidThisYear, locale)}</p>
        </article>
        <article className="rounded-card border border-border bg-white p-5 shadow-card">
          <p className="text-sm text-fg-muted">{copy.nextDue}</p>
          <p className="mt-2 font-display text-2xl font-semibold text-fg">
            {next?.due_on
              ? new Intl.DateTimeFormat(locale === "fr" ? "fr-CM" : "en-CM", {
                  month: "short",
                  day: "numeric",
                  timeZone: "Africa/Douala",
                }).format(new Date(`${next.due_on}T12:00:00Z`))
              : copy.noneDue}
          </p>
        </article>
      </div>

      <FilterBar label={copy.searchInvoices} value={q} onChange={setQ} placeholder={copy.searchInvoices} />

      {shown.length === 0 ? (
        <EmptyState title={invoices.length === 0 ? copy.noInvoices : copy.paymentsNoMatch} hint={invoices.length === 0 ? copy.noInvoicesHint : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-fg-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">{copy.colInvoice}</th>
                <th className="px-4 py-3 font-medium">{copy.colDescription}</th>
                <th className="px-4 py-3 font-medium">{copy.colDue}</th>
                <th className="px-4 py-3 font-medium">{copy.colStatus}</th>
                <th className="px-4 py-3 font-medium">{copy.colAction}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((inv) => {
                const b = balances[inv.id] ?? { confirmed: 0, pending: 0 };
                // Paid means the firm confirmed it. A payment the client only
                // reported covers the balance but is not yet money received.
                const state = feePaymentState(inv.total_minor, b);
                const settled = state === "paid";
                const reported = state === "reported";
                return (
                  <tr key={inv.id} className="border-b border-border align-top last:border-0 hover:bg-surface-sunken">
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-fg">{inv.number}</td>
                    <td className="px-4 py-3 text-fg">
                      {locale === "fr" ? inv.description_fr : inv.description_en}
                      {b.pending > 0 && (
                        <p className="tnum mt-1 text-xs text-fg-muted">
                          {labels.pending} {fmt(b.pending, locale)} {labels.xaf}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {labels.due} {inv.due_on ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={settled ? "green" : reported ? "amber-outline" : "amber"}>
                        {settled ? copy.paid : reported ? copy.paymentReported : copy.due}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      {settled ? (
                        <span className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-soft px-4 text-sm font-semibold text-teal-text">
                          {copy.paid}
                        </span>
                      ) : openFor === inv.id ? (
                        <div className="flex min-w-[16rem] flex-col gap-2">
                          <label className="text-xs text-fg-muted">
                            {labels.amount}
                            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum mt-1 min-h-[44px] w-full rounded-lg border border-border px-2 font-mono text-sm" />
                          </label>
                          <label className="text-xs text-fg-muted">
                            {labels.method}
                            <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-border px-2 text-sm">
                              {Object.entries(labels.methods).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-fg-muted">
                            {labels.reference}
                            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={labels.referenceHint} className="mt-1 min-h-[44px] w-full rounded-lg border border-border px-2 font-mono text-sm" />
                          </label>
                          <div className="flex gap-2">
                            <PrimaryButton disabled={busy} onClick={() => void report(inv)}>
                              {busy ? labels.submitting : labels.submit}
                            </PrimaryButton>
                            <button type="button" onClick={() => setOpenFor(null)} className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-sunken">
                              {copy.cancel}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <PrimaryButton onClick={() => setOpenFor(inv.id)}>{copy.payNow}</PrimaryButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-fg-muted">{copy.paymentsNote}</p>

      {payments.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold text-fg">{labels.history}</h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-white">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-surface-sunken">
                <span className="tnum font-mono text-sm text-fg">
                  {fmt(p.amount_minor, locale)} {labels.xaf}
                </span>
                <span className="text-xs text-fg-muted">{labels.methods[p.method] ?? p.method}</span>
                {p.provider_reference && (
                  <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-fg-subtle">{p.provider_reference}</code>
                )}
                <span className="ml-auto">
                  <Pill tone={p.status === "confirmed" ? "green" : p.status === "rejected" ? "danger" : "amber"}>
                    {p.status === "confirmed" ? labels.statusConfirmed : p.status === "rejected" ? labels.statusRejected : labels.statusPending}
                  </Pill>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
