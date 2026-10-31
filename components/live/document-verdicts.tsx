"use client";

import { useMemo, useState } from "react";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Card, CardHeader } from "@/components/ui";
import { CASH_DEDUCTION_THRESHOLD, VAT, type Regime } from "@/lib/rules";
import {
  needsPractitioner,
  reviewDocument,
  valueLabel,
  verdictLabel,
  type AcceptanceRecord,
  type DocumentFacts,
  type DocumentType,
  type PaymentMethod,
  type Verdict,
  type VerdictValue,
} from "@/lib/document-review";

/**
 * Document acceptance, as the practitioner actually described it.
 *
 * "A document might not be good for accounting but be recorded for taxation."
 * Every portal we studied gives an incoming document one state — accepted or
 * rejected — which forces the practitioner to pick one answer and lose the
 * other two. The panel above this one still does exactly that.
 *
 * So the input here is facts, never a conclusion: what is written on the
 * document. The three verdicts are the output, each with its own reasons and
 * each carrying the rule it rests on. A verdict whose governing rule is not
 * `verified` cannot settle anything — it escalates, visibly, instead of
 * quietly deciding on evidence we have not read.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;

const toneFor = (v: VerdictValue) => {
  if (v === "pass") return "border-success/40 bg-success-soft text-success-text";
  if (v === "fail") return "border-danger-text/40 bg-danger-soft text-danger-text";
  if (v === "indeterminate") return "border-amber/50 bg-amber-soft text-amber-text";
  return "border-border bg-surface-sunken text-fg-muted";
};

export function DocumentVerdicts({
  locale,
  t,
  initial,
  onRecord,
  recording = false,
}: {
  locale: "fr" | "en";
  t: Dict["verdicts"];
  /** A review already stored on this document. The form opens on those facts. */
  initial?: AcceptanceRecord | null;
  /** Persist the three verdicts onto the document. Absent on the unbound lab. */
  onRecord?: (record: AcceptanceRecord) => void;
  recording?: boolean;
}) {
  const seed = initial?.facts;
  const ctx = initial?.context;
  const [docType, setDocType] = useState<DocumentType>(seed?.doc_type ?? "purchase_invoice");
  const [clientRegime, setClientRegime] = useState<Regime>(ctx?.client_regime === "igs" ? "igs" : "reel");
  const [supplierRegime, setSupplierRegime] = useState<Regime | "unknown">(seed?.supplier_regime ?? "unknown");
  const [framework, setFramework] = useState<"normal" | "smt" | null>(ctx?.accounting_framework ?? null);
  const [payment, setPayment] = useState<PaymentMethod>(seed?.payment_method ?? "unknown");
  const [amount, setAmount] = useState(seed?.amount_ttc ?? 0);
  const [supplierNiu, setSupplierNiu] = useState(Boolean(seed?.supplier_niu));
  const [customerNiu, setCustomerNiu] = useState(Boolean(seed?.customer_niu));
  const [itemised, setItemised] = useState(Boolean(seed?.itemised));
  const [purpose, setPurpose] = useState(Boolean(seed?.business_purpose_stated));

  const facts: DocumentFacts = useMemo(
    () => ({
      doc_type: docType,
      // Held constant so the panel stays readable: the fields that change a
      // verdict are the ones exposed. The rest are what a well-formed invoice
      // carries, so the defaults are "present".
      supplier_name: true,
      supplier_address: true,
      supplier_contact: true,
      supplier_niu: supplierNiu ? "P059812345678" : null,
      customer_name: true,
      customer_niu: customerNiu ? "P078911223344" : null,
      itemised,
      invoice_number: "FA-2026-0914",
      invoice_date: "2026-09-14",
      amount_ht: Math.round(amount / (1 + VAT.effective)),
      vat_rate_shown: VAT.effective,
      vat_amount: amount - Math.round(amount / (1 + VAT.effective)),
      amount_ttc: amount,
      payment_method: payment,
      supplier_regime: supplierRegime,
      business_purpose_stated: purpose,
    }),
    [docType, supplierNiu, customerNiu, itemised, amount, payment, supplierRegime, purpose],
  );

  const review = useMemo(
    () =>
      reviewDocument(facts, {
        client_regime: clientRegime,
        accounting_framework: framework,
        period_date: "2026-09-30",
      }),
    [facts, clientRegime, framework],
  );

  const escalates = needsPractitioner(review);

  const chip = (active: boolean) =>
    `min-h-[44px] rounded-lg border px-3 text-sm transition-colors ${
      active
        ? "border-navy bg-navy font-semibold text-surface"
        : "border-border text-fg-muted hover:bg-surface-sunken"
    }`;

  const Choice = <T extends string>({
    legend,
    value,
    onChange,
    options,
  }: {
    legend: string;
    value: T;
    onChange: (v: T) => void;
    options: { v: T; label: string }[];
  }) => (
    <fieldset>
      <legend className="text-sm font-medium text-fg">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={chip(value === o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const Toggle = ({
    label,
    on,
    set,
  }: {
    label: string;
    on: boolean;
    set: (b: boolean) => void;
  }) => (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-fg-muted">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="h-4 w-4 rounded border-border-strong accent-navy"
      />
      {label}
    </label>
  );

  const sourceBadge = (v: Verdict["reasons"][number]) => {
    if (!v.source) return null;
    const label =
      v.source.status === "verified"
        ? t.sourceVerified
        : v.source.status === "inferred"
          ? t.sourceInferred
          : t.sourceUnverified;
    const tone =
      v.source.status === "verified"
        ? "bg-success-soft text-success-text"
        : "bg-amber-soft text-amber-text";
    return (
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
    );
  };

  return (
    <Card>
      <CardHeader
        title={t.title}
        action={
          escalates ? (
            <span className="rounded-lg bg-amber-soft px-2 py-1 text-xs font-semibold text-amber-text">
              {t.needsPractitioner}
            </span>
          ) : undefined
        }
      />
      <div className="p-4 sm:p-5">
        <p className="text-sm text-fg-muted">{t.subtitle}</p>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          {/* The facts ---------------------------------------------------- */}
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="font-display text-sm font-semibold text-fg">{t.factsTitle}</h4>
              <p className="mt-0.5 text-xs text-fg-subtle">{t.factsHint}</p>
            </div>

            <Choice
              legend={t.docType}
              value={docType}
              onChange={setDocType}
              options={[
                { v: "purchase_invoice" as DocumentType, label: t.docPurchase },
                { v: "sales_invoice" as DocumentType, label: t.docSales },
                { v: "expense_receipt" as DocumentType, label: t.docReceipt },
                { v: "bank_statement" as DocumentType, label: t.docBank },
              ]}
            />

            <Choice
              legend={t.clientRegime}
              value={clientRegime}
              onChange={setClientRegime}
              options={[
                { v: "reel" as Regime, label: "Réel" },
                { v: "igs" as Regime, label: "IGS" },
              ]}
            />

            <Choice
              legend={t.supplierRegime}
              value={supplierRegime}
              onChange={setSupplierRegime}
              options={[
                { v: "reel" as Regime | "unknown", label: "Réel" },
                { v: "igs" as Regime | "unknown", label: "IGS" },
                { v: "unknown" as Regime | "unknown", label: t.supplierUnknown },
              ]}
            />

            <Choice
              legend={t.payment}
              value={payment}
              onChange={setPayment}
              options={[
                { v: "bank" as PaymentMethod, label: t.payBank },
                { v: "cash" as PaymentMethod, label: t.payCash },
                { v: "cheque" as PaymentMethod, label: t.payCheque },
                { v: "mobile_money" as PaymentMethod, label: t.payMobile },
                { v: "unknown" as PaymentMethod, label: t.payUnknown },
              ]}
            />

            <Choice
              legend={t.framework}
              value={framework ?? "unknown"}
              onChange={(v) => setFramework(v === "unknown" ? null : (v as "normal" | "smt"))}
              options={[
                { v: "normal", label: t.frameworkNormal },
                { v: "smt", label: t.frameworkSmt },
                { v: "unknown", label: t.frameworkUnknown },
              ]}
            />

            <div>
              <label htmlFor="amt" className="text-sm font-medium text-fg">
                {t.amount}
              </label>
              <input
                id="amt"
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                className="mt-2 min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 font-mono text-sm text-fg sm:max-w-xs"
              />
              <p className="mt-1 text-xs text-fg-subtle">
                {CASH_DEDUCTION_THRESHOLD.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} FCFA
                {locale === "fr" ? " — seuil du paiement en espèces" : " — cash payment threshold"}
              </p>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-fg">{t.mentions}</legend>
              <div className="mt-1 grid gap-0.5 sm:grid-cols-2">
                <Toggle label={t.mSupplierNiu} on={supplierNiu} set={setSupplierNiu} />
                <Toggle label={t.mCustomerNiu} on={customerNiu} set={setCustomerNiu} />
                <Toggle label={t.mItemised} on={itemised} set={setItemised} />
                <Toggle label={t.mPurpose} on={purpose} set={setPurpose} />
              </div>
            </fieldset>
          </div>

          {/* The verdicts ------------------------------------------------- */}
          <div className="flex flex-col gap-3">
            <div>
              <h4 className="font-display text-sm font-semibold text-fg">{t.verdictsTitle}</h4>
              <p className="mt-0.5 text-xs text-fg-subtle">{t.recorded}</p>
            </div>

            {review.verdicts.map((v) => (
              <div key={v.kind} className={`rounded-card border p-3 ${toneFor(v.value)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-sm font-semibold">
                    {locale === "fr" ? verdictLabel[v.kind].fr : verdictLabel[v.kind].en}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {locale === "fr" ? valueLabel[v.value].fr : valueLabel[v.value].en}
                  </p>
                </div>

                {v.reasons.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-2">
                    {v.reasons.map((r) => (
                      <li key={r.code} className="border-t border-current/15 pt-2 text-xs">
                        <p className="opacity-90">{locale === "fr" ? r.fr : r.en}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2">
                          {sourceBadge(r)}
                          {r.source && (
                            <span className="opacity-70">{r.source.authority}</span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            <div className="rounded-card border border-border bg-surface-sunken p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t.missingTitle}
              </p>
              <p className="mt-1 text-xs text-fg-subtle">{t.missingHint}</p>
              {review.missingMentions.length === 0 ? (
                <p className="mt-2 text-sm text-success-text">{t.missingNone}</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {review.missingMentions.map((m) => (
                    <li
                      key={m.code}
                      className="rounded bg-surface px-2 py-1 text-xs text-fg-muted"
                    >
                      {locale === "fr" ? m.fr : m.en}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {onRecord ? (
              <button
                type="button"
                disabled={recording}
                onClick={() =>
                  onRecord({
                    facts,
                    context: {
                      client_regime: clientRegime,
                      accounting_framework: framework,
                      period_date: ctx?.period_date ?? new Date().toISOString().slice(0, 10),
                    },
                    verdicts: review.verdicts,
                    recorded_at: new Date().toISOString(),
                  })
                }
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-60"
              >
                {t.recordOnFile}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
