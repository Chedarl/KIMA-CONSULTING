import { billingLabel, filingLabel, stageLabel } from "@/lib/cases";
import type { BillingStatus, CaseStage, FilingStatus } from "@/lib/cases";
import type { CertificateStatus, PaymentState } from "@/lib/incidents";
import type { IncidentCopy } from "@/lib/i18n-incident";
import { BasisChip, Panel, type BasisTone } from "./parts";

/**
 * The five dimensions, side by side and never collapsed (journeys.md §2).
 * Each shows its value and, separately, on what basis it is shown.
 */
export function StatusDimensions({
  locale,
  t,
  view,
  stage,
  filing,
  payment,
  billing,
  certificate,
}: {
  locale: "fr" | "en";
  t: IncidentCopy;
  view: "taxpayer" | "reviewer";
  stage: CaseStage;
  filing: FilingStatus;
  payment: PaymentState;
  billing: BillingStatus;
  certificate: CertificateStatus;
}) {
  const declared = view === "taxpayer" ? t.basis.declared : t.basisReviewer.declared;
  const paymentBasis: BasisTone =
    payment === "verified"
      ? "verified"
      : payment === "attempted" || payment === "debit_observed" || payment === "reference_recorded"
        ? "declared"
        : "recorded";
  const filingBasis: BasisTone = filing === "verified" ? "verified" : filing === "attempted" ? "declared" : "recorded";
  const certBasis: BasisTone =
    certificate === "obtained" ? "verified" : certificate === "requested" || certificate === "blocked" ? "declared" : "recorded";

  const word = (b: BasisTone) => (b === "verified" ? t.basis.verified : b === "declared" ? declared : t.basis.recorded);

  const rows: { key: string; label: string; value: string; basis: BasisTone; basisText: string; warn?: boolean }[] = [
    { key: "work", label: t.dimensions.work, value: stageLabel(stage, locale), basis: "recorded", basisText: t.basis.workflow },
    { key: "filing", label: t.dimensions.filing, value: filingLabel(filing, locale), basis: filingBasis, basisText: word(filingBasis) },
    {
      key: "payment",
      label: t.dimensions.payment,
      value: t.payment[payment],
      basis: paymentBasis,
      basisText: word(paymentBasis),
      warn: payment === "debit_observed" || payment === "reference_recorded" || payment === "disputed",
    },
    { key: "fee", label: t.dimensions.fee, value: billingLabel(billing, locale), basis: "recorded", basisText: t.basis.recorded },
    {
      key: "certificate",
      label: t.dimensions.certificate,
      value: t.certificate[certificate],
      basis: certBasis,
      basisText: word(certBasis),
      warn: certificate === "blocked",
    },
  ];

  return (
    <Panel title={t.dimensionsTitle} id="dimensions">
      <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-5">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-1.5 bg-surface p-3">
            <dt className="text-xs font-medium text-fg-muted">{r.label}</dt>
            <dd className={`text-sm font-semibold ${r.warn ? "text-amber-text" : "text-fg"}`}>{r.value}</dd>
            <dd>
              <BasisChip basis={r.basis}>{r.basisText}</BasisChip>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
