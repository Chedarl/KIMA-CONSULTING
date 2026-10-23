"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  feeOverdue,
  invoiceStatusLabel,
  ledgerBalance,
  PAYMENT_REVIEW_LABELS,
  paymentStatusLabel,
  reviewServicePayment,
  type FeeInvoice,
  type FeePayment,
} from "@/lib/billing";
import { billingLabel, type BillingStatus } from "@/lib/cases";
import { todayInDouala } from "@/lib/dates";
import { updateById } from "@/lib/db-write";
import { memberFromSession, subscribeFirmSession, type FirmSession } from "@/lib/firm-auth";
import { formatXaf } from "@/lib/i18n";
import { can, denialLabel, type Actor } from "@/lib/permissions";
import { audit, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";

/**
 * The firm's fee book.
 *
 * Invoices and reported payments are the ledger. The case's billing status is
 * shown beside them and is not written: no engine advances that dimension.
 * Tax payment evidence is not on this screen at all.
 */
export type BillingLabels = {
  signIn: string;
  issuedTotal: string;
  confirmedTotal: string;
  outstandingTotal: string;
  awaitingTotal: string;
  invoices: string;
  payments: string;
  caseFees: string;
  caseFeesHint: string;
  emptyInvoices: string;
  noIssue: string;
  emptyPayments: string;
  emptyCases: string;
  confirm: string;
  reject: string;
  reference: string;
  overdue: string;
  client: string;
  due: string;
  total: string;
  balance: string;
  openCase: string;
  offline: string;
  confirmedToast: string;
  rejectedToast: string;
  failed: string;
  methods: Record<string, string>;
};

type InvoiceRow = FeeInvoice & {
  description_fr: string;
  description_en: string;
  issued_on: string | null;
};

type PaymentRow = FeePayment & {
  id: string;
  taxpayer_id: string;
  method: string;
  created_at: string;
};

type CaseFee = {
  id: string;
  taxpayer_id: string;
  obligation_code: string;
  period_token: string;
  billing_status: BillingStatus;
};

const money = (minor: number, locale: "fr" | "en") => `${formatXaf(minor, locale)} XAF`;

export function BillingWorkspace({
  locale,
  labels,
}: {
  locale: "fr" | "en";
  labels: BillingLabels;
}) {
  const toast = useToast();
  const [session, setSession] = useState<FirmSession | null | undefined>(undefined);
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [cases, setCases] = useState<CaseFee[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => subscribeFirmSession(setSession), []);

  const actor = useMemo<Actor | null>(
    () => (session ? { kind: "firm", member: memberFromSession(session) } : null),
    [session],
  );
  const mayView = actor ? can(actor, "billing.view").ok : false;

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [inv, pay, cs, tp] = await Promise.all([
        db.from("invoices").select("*").order("due_on", { ascending: true }),
        db.from("service_payments").select("*").order("created_at", { ascending: false }),
        db
          .from("compliance_cases")
          .select("id, taxpayer_id, obligation_code, period_token, billing_status")
          .order("period_token", { ascending: false }),
        db.from("taxpayers").select("id, legal_name"),
      ]);
      if (inv.error || pay.error || cs.error || tp.error) {
        throw inv.error ?? pay.error ?? cs.error ?? tp.error;
      }
      setInvoices((inv.data ?? []) as InvoiceRow[]);
      setPayments((pay.data ?? []) as PaymentRow[]);
      setCases((cs.data ?? []) as CaseFee[]);
      setNames(
        Object.fromEntries(
          ((tp.data ?? []) as { id: string; legal_name: string }[]).map((t) => [t.id, t.legal_name]),
        ),
      );
      setOffline(false);
    } catch {
      setOffline(true);
      setInvoices([]);
      setPayments([]);
      setCases([]);
    }
  }, []);

  useEffect(() => {
    if (mayView) void load();
  }, [mayView, load]);

  const today = todayInDouala();
  const overdueCount = useMemo(
    () =>
      (invoices ?? []).filter((inv) => feeOverdue(inv, today, ledgerBalance(payments, inv.id).confirmed))
        .length,
    [invoices, payments, today],
  );

  const totals = useMemo(() => {
    let issued = 0;
    let confirmed = 0;
    let outstanding = 0;
    for (const inv of invoices ?? []) {
      if (inv.status === "void" || inv.status === "draft") continue;
      const bal = ledgerBalance(payments, inv.id);
      issued += inv.total_minor;
      confirmed += bal.confirmed;
      const left = inv.total_minor - bal.confirmed;
      if (left > 0) outstanding += left;
    }
    const awaiting = payments
      .filter((p) => p.status === "pending_confirmation")
      .reduce((sum, p) => sum + p.amount_minor, 0);
    return { issued, confirmed, outstanding, awaiting };
  }, [invoices, payments]);

  async function decide(payment: PaymentRow, to: "confirmed" | "rejected") {
    if (!session || !actor) {
      toast(labels.signIn, "error");
      return;
    }
    const allowed = can(actor, "billing.manage", payment.taxpayer_id);
    if (!allowed.ok) {
      toast(denialLabel(allowed.reason, locale), "error");
      return;
    }
    const result = reviewServicePayment(payment, {
      to,
      by: session.personLabel,
      reference: to === "confirmed" ? refs[payment.id] ?? payment.provider_reference : undefined,
    });
    if (!result.ok) {
      const text = PAYMENT_REVIEW_LABELS[result.reason];
      toast(locale === "fr" ? text.fr : text.en, "error");
      return;
    }
    setBusy(payment.id);
    setPayments((prev) =>
      prev.map((row) =>
        row.id === payment.id ? { ...row, ...result.patch, status: result.patch.status } : row,
      ),
    );
    const written = await updateById("service_payments", payment.id, result.patch);
    setBusy(null);
    if (!written.ok) {
      setPayments((prev) => prev.map((row) => (row.id === payment.id ? payment : row)));
      toast(labels.failed, "error");
      return;
    }
    await audit({
      taxpayerId: payment.taxpayer_id,
      actor: "firm",
      action: to === "confirmed" ? "payment.confirmed" : "payment.rejected",
      resourceType: "service_payment",
      resourceId: payment.id,
      before: { status: payment.status },
      after: result.patch,
    });
    toast(to === "confirmed" ? labels.confirmedToast : labels.rejectedToast);
    void load();
  }

  if (session === undefined) {
    return <div className="h-24 animate-pulse rounded-card bg-surface-sunken" aria-busy="true" />;
  }
  if (session === null) {
    return (
      <p className="rounded-card border border-border bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
        {labels.signIn}
      </p>
    );
  }
  if (!mayView) {
    return (
      <p className="rounded-card border border-border bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
        {denialLabel("role_lacks_capability", locale)}
      </p>
    );
  }
  if (offline) {
    return <p className="text-sm text-amber-text">{labels.offline}</p>;
  }
  if (invoices === null) {
    return <div className="h-24 animate-pulse rounded-card bg-surface-sunken" aria-busy="true" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={labels.issuedTotal} value={money(totals.issued, locale)} />
        <Tile label={labels.confirmedTotal} value={money(totals.confirmed, locale)} />
        <Tile
          label={labels.outstandingTotal}
          value={money(totals.outstanding, locale)}
          alert={overdueCount > 0}
        />
        <Tile
          label={labels.awaitingTotal}
          value={money(totals.awaiting, locale)}
          alert={totals.awaiting > 0}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-fg">{labels.invoices}</h2>
        <p className="text-xs text-fg-subtle">{labels.noIssue}</p>
        {invoices.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
            {labels.emptyInvoices}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {invoices.map((inv) => {
              const bal = ledgerBalance(payments, inv.id);
              const unpaid = Math.max(inv.total_minor - bal.confirmed, 0);
              const late = feeOverdue(inv, today, bal.confirmed);
              return (
                <li key={inv.id} className="rounded-card border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-fg">{inv.number}</p>
                      <p className="text-sm text-fg-muted">
                        {names[inv.taxpayer_id] ?? labels.client} ·{" "}
                        {locale === "fr" ? inv.description_fr : inv.description_en}
                      </p>
                    </div>
                    <span className="flex flex-wrap items-center gap-2">
                      {late && (
                        <span className="rounded-full border border-amber/50 bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-text">
                          {labels.overdue}
                        </span>
                      )}
                      <span className="text-xs font-medium text-fg-muted">
                        {invoiceStatusLabel(inv.status, locale)}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-fg-subtle">
                    {labels.total}: <span className="tnum">{money(inv.total_minor, locale)}</span>
                    {" · "}
                    {labels.balance}: <span className="tnum">{money(unpaid, locale)}</span>
                    {inv.due_on ? ` · ${labels.due} ${inv.due_on}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-fg">{labels.payments}</h2>
        {payments.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
            {labels.emptyPayments}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {payments.map((p) => {
              const mayManage = actor ? can(actor, "billing.manage", p.taxpayer_id).ok : false;
              const pending = p.status === "pending_confirmation";
              return (
                <li key={p.id} className="rounded-card border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-fg">
                        {names[p.taxpayer_id] ?? labels.client}
                      </p>
                      <p className="text-xs text-fg-muted">
                        {labels.methods[p.method] ?? p.method} · {paymentStatusLabel(p.status, locale)}
                        {p.provider_reference ? ` · ${p.provider_reference}` : ""}
                      </p>
                    </div>
                    <p className="tnum text-sm font-semibold text-fg">{money(p.amount_minor, locale)}</p>
                  </div>
                  {pending && (
                    <div className="mt-3 flex flex-col gap-2">
                      {!p.provider_reference && (
                        <label className="flex flex-col gap-1 text-xs text-fg-muted">
                          {labels.reference}
                          <input
                            value={refs[p.id] ?? ""}
                            onChange={(e) => setRefs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
                          />
                        </label>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!mayManage || busy === p.id}
                          onClick={() => void decide(p, "confirmed")}
                          className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-3 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-50"
                        >
                          {labels.confirm}
                        </button>
                        <button
                          type="button"
                          disabled={!mayManage || busy === p.id}
                          onClick={() => void decide(p, "rejected")}
                          className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-sunken disabled:opacity-50"
                        >
                          {labels.reject}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-fg">{labels.caseFees}</h2>
        <p className="text-xs text-fg-subtle">{labels.caseFeesHint}</p>
        {cases.length === 0 ? (
          <p className="text-sm text-fg-muted">{labels.emptyCases}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cases.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-fg">
                    {names[c.taxpayer_id] ?? labels.client} · {c.obligation_code} · {c.period_token}
                  </p>
                  <p
                    className={`text-xs ${c.billing_status === "outstanding" ? "font-semibold text-amber-text" : "text-fg-muted"}`}
                  >
                    {billingLabel(c.billing_status, locale)}
                  </p>
                </div>
                <Link
                  href={`/${locale}/workspace/cases/${c.id}`}
                  className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text"
                >
                  {labels.openCase}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className={`tnum font-display text-xl font-semibold leading-none ${alert ? "text-amber-text" : "text-fg"}`}>
        {value}
      </p>
      <p className="mt-2 text-xs font-medium text-fg-muted">{label}</p>
    </div>
  );
}
