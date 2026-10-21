import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { PaymentsPanel } from "@/components/live/payments-panel";

/** Kima's service fees — deliberately not the same screen as anything tax-related. */
export default function PaymentsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const p = w.client.payments;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.client.nav.payments}</h2>
        <p className="text-sm text-fg-muted">{p.subtitle}</p>
      </div>

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
    </div>
  );
}
