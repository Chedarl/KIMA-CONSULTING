/**
 * Kima's fee ledger — invoices and the payments reported against them.
 *
 * This is not the case's `billing_status` dimension, and it is not the tax.
 * `billing_status` says whether the fee on a case was settled. An invoice says
 * what was billed. A service payment says what was reported or confirmed.
 * Balances are derived from the payment rows, never stored, so a stored
 * balance cannot drift from the lines that produced it.
 *
 * Confirming a payment is the act the client panel already promises and the
 * database already constrains: a row becomes `confirmed` only with a reference,
 * a named person and a time. There is no function here that advances
 * `billing_status`. That transition does not exist beside `recordFiling`, and
 * a screen must not invent it by writing the column.
 */

export type InvoiceStatus = "draft" | "issued" | "void";

export type ServicePaymentStatus = "pending_confirmation" | "confirmed" | "rejected";

export type FeeInvoice = {
  id: string;
  taxpayer_id: string;
  number: string;
  total_minor: number;
  status: string;
  due_on: string | null;
};

export type FeePayment = {
  invoice_id: string;
  amount_minor: number;
  status: string;
  provider_reference: string | null;
};

export type FeeBalance = { confirmed: number; pending: number };

/** Confirmed and still-pending amounts for one invoice. Rejected lines count as nothing. */
export function ledgerBalance(payments: FeePayment[], invoiceId: string): FeeBalance {
  const out: FeeBalance = { confirmed: 0, pending: 0 };
  for (const p of payments) {
    if (p.invoice_id !== invoiceId) continue;
    if (p.status === "confirmed") out.confirmed += p.amount_minor;
    else if (p.status === "pending_confirmation") out.pending += p.amount_minor;
  }
  return out;
}

/** What is still unpaid, counting a pending report so the client cannot over-report. */
export function outstandingMinor(totalMinor: number, balance: FeeBalance): number {
  return totalMinor - balance.confirmed - balance.pending;
}

/**
 * An issued invoice whose due date has passed and whose confirmed receipts
 * do not cover it. Pending reports do not clear the alert: a report is not
 * a confirmation.
 */
export function feeOverdue(invoice: FeeInvoice, today: string, confirmedMinor: number): boolean {
  if (invoice.status !== "issued") return false;
  if (!invoice.due_on || invoice.due_on >= today) return false;
  return invoice.total_minor - confirmedMinor > 0;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, { fr: string; en: string }> = {
  draft: { fr: "Brouillon", en: "Draft" },
  issued: { fr: "Émise", en: "Issued" },
  void: { fr: "Annulée", en: "Void" },
};

export const PAYMENT_STATUS_LABELS: Record<ServicePaymentStatus, { fr: string; en: string }> = {
  pending_confirmation: { fr: "À confirmer", en: "To confirm" },
  confirmed: { fr: "Confirmé", en: "Confirmed" },
  rejected: { fr: "Rejeté", en: "Rejected" },
};

const isInvoiceStatus = (s: string): s is InvoiceStatus =>
  s === "draft" || s === "issued" || s === "void";

const isPaymentStatus = (s: string): s is ServicePaymentStatus =>
  s === "pending_confirmation" || s === "confirmed" || s === "rejected";

export function invoiceStatusLabel(status: string, locale: "fr" | "en"): string {
  if (!isInvoiceStatus(status)) return status;
  return locale === "fr" ? INVOICE_STATUS_LABELS[status].fr : INVOICE_STATUS_LABELS[status].en;
}

export function paymentStatusLabel(status: string, locale: "fr" | "en"): string {
  if (!isPaymentStatus(status)) return status;
  return locale === "fr" ? PAYMENT_STATUS_LABELS[status].fr : PAYMENT_STATUS_LABELS[status].en;
}

export type PaymentReviewInput =
  | { to: "confirmed"; by: string; reference?: string | null; at?: string }
  | { to: "rejected"; by: string; at?: string };

export type PaymentReviewPatch = {
  status: ServicePaymentStatus;
  provider_reference?: string;
  confirmed_at?: string;
  confirmed_by?: string;
};

export type PaymentReviewResult =
  | { ok: true; patch: PaymentReviewPatch }
  | { ok: false; reason: "not_pending" | "reference_required" | "actor_required" };

/**
 * The firm's decision on a payment the client (or the firm) already reported.
 *
 * Only `pending_confirmation` can move. Confirmed and rejected are finished:
 * rewriting them would let a receipt appear and disappear. Confirmation copies
 * the database rule — reference, confirmer, time — so the CHECK is not the
 * first place a practitioner hears about it.
 */
export function reviewServicePayment(
  current: Pick<FeePayment, "status" | "provider_reference">,
  input: PaymentReviewInput,
): PaymentReviewResult {
  if (current.status !== "pending_confirmation") return { ok: false, reason: "not_pending" };
  const by = input.by.trim();
  if (!by) return { ok: false, reason: "actor_required" };

  if (input.to === "rejected") {
    return { ok: true, patch: { status: "rejected" } };
  }

  const reference = (input.reference ?? current.provider_reference ?? "").trim();
  if (!reference) return { ok: false, reason: "reference_required" };

  return {
    ok: true,
    patch: {
      status: "confirmed",
      provider_reference: reference,
      confirmed_by: by,
      confirmed_at: input.at ?? new Date().toISOString(),
    },
  };
}

export const PAYMENT_REVIEW_LABELS: Record<
  Extract<PaymentReviewResult, { ok: false }>["reason"],
  { fr: string; en: string }
> = {
  not_pending: {
    fr: "Ce paiement n'est plus en attente de confirmation.",
    en: "This payment is no longer awaiting confirmation.",
  },
  reference_required: {
    fr: "Une confirmation exige une référence. Le registre refuse une ligne confirmée sans elle.",
    en: "A confirmation needs a reference. The ledger refuses a confirmed row without one.",
  },
  actor_required: {
    fr: "La confirmation doit porter le nom de la personne qui la donne.",
    en: "A confirmation has to carry the name of the person who gives it.",
  },
};
