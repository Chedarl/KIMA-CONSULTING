"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { audit, demoIds, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";

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
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);
  const [error, setError] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mtn_momo");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const resolved = await demoIds();
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
    for (const p of payments) {
      const slot = (out[p.invoice_id] ??= { confirmed: 0, pending: 0 });
      if (p.status === "confirmed") slot.confirmed += p.amount_minor;
      if (p.status === "pending_confirmation") slot.pending += p.amount_minor;
    }
    return out;
  }, [payments]);

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
        organization_id: ids.organizationId,
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
        organizationId: ids.organizationId,
        actor: { role: "client", label: "Client" },
        kind: "note_added",
        subject: invoice.number,
        reason: `Paiement signalé / Payment reported for invoice ${invoice.number}`,
      });
      await audit({
        taxpayerId: ids.taxpayerId,
        organizationId: ids.organizationId,
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

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-card border border-border bg-surface-sunken px-4 py-2.5 text-xs text-fg-muted">
        {labels.notAGateway}
      </p>

      <section>
        <h3 className="mb-3 font-display text-base font-semibold text-fg">{labels.invoices}</h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-fg-muted">{labels.noInvoices}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {invoices.map((inv, i) => {
              const b = balances[inv.id] ?? { confirmed: 0, pending: 0 };
              const outstanding = inv.total_minor - b.confirmed - b.pending;
              const settled = outstanding <= 0;
              return (
                <li
                  key={inv.id}
                  className="rise-in rounded-card border border-border bg-surface p-4"
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-fg">{inv.number}</p>
                      <p className="text-sm text-fg-muted">
                        {locale === "fr" ? inv.description_fr : inv.description_en}
                      </p>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {labels.due} {inv.due_on}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tnum font-mono text-lg font-semibold text-fg">
                        {fmt(inv.total_minor, locale)}
                        <span className="ml-1 text-xs text-fg-muted">{labels.xaf}</span>
                      </p>
                      <p
                        className={`tnum font-mono text-xs ${
                          settled ? "text-teal-text" : "text-amber-text"
                        }`}
                      >
                        {settled
                          ? labels.paid
                          : `${labels.balance} ${fmt(outstanding, locale)} ${labels.xaf}`}
                      </p>
                      {b.pending > 0 && (
                        <p className="tnum font-mono text-xs text-fg-subtle">
                          {labels.pending} {fmt(b.pending, locale)} {labels.xaf}
                        </p>
                      )}
                    </div>
                  </div>

                  {!settled && (
                    <div className="mt-3">
                      {openFor === inv.id ? (
                        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-3">
                          <div className="flex flex-wrap gap-2">
                            <label className="flex flex-col gap-1 text-xs text-fg-muted">
                              {labels.amount}
                              <input
                                inputMode="numeric"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="tnum min-h-[44px] w-36 rounded-lg border border-border bg-surface px-2 font-mono text-sm text-fg"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-fg-muted">
                              {labels.method}
                              <select
                                value={method}
                                onChange={(e) => setMethod(e.target.value)}
                                className="min-h-[44px] rounded-lg border border-border bg-surface px-2 text-sm text-fg"
                              >
                                {Object.entries(labels.methods).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-1 flex-col gap-1 text-xs text-fg-muted">
                              {labels.reference}
                              <input
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                placeholder={labels.referenceHint}
                                className="min-h-[44px] rounded-lg border border-border bg-surface px-2 font-mono text-sm text-fg"
                              />
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void report(inv)}
                              className="min-h-[44px] rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-60"
                            >
                              {busy ? labels.submitting : labels.submit}
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenFor(null)}
                              className="min-h-[44px] rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenFor(inv.id)}
                          className="min-h-[44px] rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-surface-sunken"
                        >
                          {labels.record}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 font-display text-base font-semibold text-fg">{labels.history}</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-fg-muted">—</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="tnum font-mono text-sm text-fg">
                  {fmt(p.amount_minor, locale)} {labels.xaf}
                </span>
                <span className="text-xs text-fg-muted">{labels.methods[p.method] ?? p.method}</span>
                {p.provider_reference && (
                  <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-fg-subtle">
                    {p.provider_reference}
                  </code>
                )}
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.status === "confirmed"
                      ? "bg-teal-soft text-teal-text"
                      : p.status === "rejected"
                        ? "bg-danger-soft text-danger-text"
                        : "bg-amber-soft text-amber-text"
                  }`}
                >
                  {p.status === "confirmed"
                    ? labels.statusConfirmed
                    : p.status === "rejected"
                      ? labels.statusRejected
                      : labels.statusPending}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
