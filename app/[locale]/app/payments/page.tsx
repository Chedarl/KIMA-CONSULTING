import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { PaymentsPanel } from "@/components/live/payments-panel";

/** Kima service fees. Reporting a payment is not a collection gateway. */
export default function PaymentsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const p = w.client.payments;

  return (
    <PaymentsPanel
      locale={locale}
      labels={{
        invoices: p.invoices,
        history: p.history,
        issued: p.issued,
        due: p.due,
        total: p.total,
        balance: p.balance,
        paid: p.paid,
        pending: p.pending,
        record: p.record,
        amount: p.amount,
        method: p.method,
        methods: {
          mtn_momo: p.mtn,
          orange_money: p.orange,
          bank_transfer: p.transfer,
          cash: p.cash,
        },
        reference: p.reference,
        referenceHint: p.referenceHint,
        submit: p.submit,
        submitting: p.submitting,
        recorded: p.recorded,
        failed: w.firm.checks.failed,
        invalidAmount: p.invalidAmount,
        overpay: p.overpay,
        needReference: p.needReference,
        noInvoices: p.noInvoices,
        notAGateway: p.notAGateway,
        statusPending: p.statusPending,
        statusConfirmed: p.statusConfirmed,
        statusRejected: p.statusRejected,
        xaf: t.common.xaf,
        connecting: t.work.connecting,
        offline: t.work.offline,
        live: t.work.live,
      }}
    />
  );
}
