/**
 * Document acceptance — three verdicts, not one.
 *
 * From the 21 October 2026 practitioner session, the sentence that reframed this
 * whole surface:
 *
 *   "There are a number of things that we look out for in order to approve an
 *    accounting document. A document might not be good for accounting but be
 *    recorded for taxation."
 *
 * Every portal we researched — PwC Connect, Engagement Center, EY Canvas, KPMG
 * Clara, the mid-market tools — gives an incoming document ONE state: received,
 * accepted, rejected. That cannot express what she described. In her practice a
 * document carries verdicts that can disagree: a handwritten receipt with no NIU
 * may be unusable for a VAT claim, still deductible as a charge, and still
 * recorded because the expenditure genuinely happened.
 *
 * A single accept/reject control forces the practitioner to pick one answer and
 * lose the other two — and the two lost are exactly what the client asks about
 * later ("why was my receipt refused?" — it wasn't; its VAT was).
 *
 * So:
 *
 *   1. ACCOUNTING            — can this be booked under the applicable framework?
 *   2. CHARGE DEDUCTIBILITY  — is the expense deductible against taxable profit?
 *   3. VAT RECOVERY          — is the input VAT recoverable?
 *
 * A document is ALWAYS recorded. A failed accounting verdict does not discard it;
 * it records it with a stated defect, which is her "not good for accounting but
 * recorded for taxation".
 *
 * Every reason carries the rule behind it, and a reason whose rule is not
 * `verified` cannot decide a verdict — it escalates to a human. See
 * `docs/foundation/cameroon-rule-corpus-research.md` for why most of this corpus
 * is not verified, and `lib/rules.ts` for the rules themselves.
 *
 * Pure functions, so a verdict can always be explained to a client and audited by
 * a reviewer without running the application.
 */

import {
  CASH_DEDUCTION_THRESHOLD,
  CASH_RULE_SOURCE,
  SUPPLIER_REGIME_RULE_SOURCE,
  VAT,
  isActive,
  regime as regimeDef,
  type Regime,
  type RuleSource,
  type Xaf,
} from "./rules";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type DocumentType =
  | "purchase_invoice"
  | "sales_invoice"
  | "expense_receipt"
  | "bank_statement"
  | "other";

export type PaymentMethod =
  | "cash"
  | "bank"
  | "cheque"
  | "mobile_money"
  | "other"
  | "unknown";

/**
 * What was read off the document. Booleans are "present on the face of the
 * document"; `null` on a value means not established, which is a different thing
 * from absent and is never treated as a failure.
 */
export type DocumentFacts = {
  doc_type: DocumentType;

  // The practitioner's checklist: both parties identified.
  supplier_name: boolean;
  supplier_address: boolean;
  supplier_contact: boolean;
  supplier_niu: string | null;
  customer_name: boolean;
  customer_niu: string | null;

  itemised: boolean;
  invoice_number: string | null;
  invoice_date: string | null;

  /** Integer XAF. Never a float. */
  amount_ht: Xaf | null;
  /** Decimal fraction, e.g. 0.1925. */
  vat_rate_shown: number | null;
  vat_amount: Xaf | null;
  amount_ttc: Xaf | null;

  payment_method: PaymentMethod | null;

  /**
   * The supplier's own tax regime. The single most consequential field here and
   * the one nothing on the invoice announces.
   */
  supplier_regime: Regime | "unknown" | null;

  /** Is the business purpose of the expense apparent? A judgement, recorded. */
  business_purpose_stated: boolean;
};

export type ReviewContext = {
  /** The client's regime. An IGS client is reportedly not a VAT collector. */
  client_regime: Regime | null;
  /** Separate from the regime — CLAUDE.md forbids inferring one from the other. */
  accounting_framework: "normal" | "smt" | null;
  /** The period being worked on, so historical rules apply to historical work. */
  period_date: string;
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type VerdictKind = "accounting" | "charge_deductibility" | "vat_recovery";

/**
 * `indeterminate` is a first-class answer, not a failure to compute. Most of the
 * corpus is unverified, and "we cannot tell you, here is what we found" is the
 * honest output — and more useful than a confident wrong one.
 */
export type VerdictValue = "pass" | "fail" | "partial" | "indeterminate" | "not_applicable";

export type Reason = {
  code: string;
  fr: string;
  en: string;
  /** The rule behind it. Absent where the reason is a completeness observation. */
  source?: RuleSource;
  /**
   * Does this reason settle the verdict? A decisive reason on an unverified rule
   * does not settle anything — it sets `requiresHumanDecision`.
   */
  decisive: boolean;
};

export type Verdict = {
  kind: VerdictKind;
  value: VerdictValue;
  reasons: Reason[];
  /** A practitioner must decide: a decisive reason rests on an unverified rule. */
  requiresHumanDecision: boolean;
};

/** What was read on one document, and the three verdicts that followed. */
export type AcceptanceRecord = {
  facts: DocumentFacts;
  context: ReviewContext;
  verdicts: Verdict[];
  recorded_at: string;
};

export type DocumentReview = {
  verdicts: Verdict[];
  /**
   * Always true. The practitioner's point: a document that fails accounting is
   * still recorded. Nothing here deletes evidence of a real transaction.
   */
  recorded: true;
  /** Mentions from her checklist that are not on the document. */
  missingMentions: Reason[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r = (
  code: string,
  fr: string,
  en: string,
  decisive: boolean,
  source?: RuleSource,
): Reason => ({ code, fr, en, decisive, source });

/**
 * A verdict is settled only where every decisive reason rests on an active rule.
 * This is the constraint from CLAUDE.md made structural: an inferred rule can
 * inform a practitioner and cannot decide for them.
 */
function settle(kind: VerdictKind, proposed: VerdictValue, reasons: Reason[]): Verdict {
  const decisive = reasons.filter((x) => x.decisive);
  const unbacked = decisive.filter((x) => !x.source || !isActive(x.source));
  if (unbacked.length > 0 && proposed !== "pass" && proposed !== "not_applicable") {
    return { kind, value: "indeterminate", reasons, requiresHumanDecision: true };
  }
  return { kind, value: proposed, reasons, requiresHumanDecision: false };
}

const isInvoiceGrade = (t: DocumentType) =>
  t === "purchase_invoice" || t === "sales_invoice";

/** Does the VAT rate shown match the general rate? Tolerant of rounding. */
const rateMatches = (shown: number) => Math.abs(shown - VAT.effective) < 0.0005;

/** The amount the cash threshold is tested against: inclusive of tax where known. */
const testableAmount = (f: DocumentFacts): Xaf | null =>
  f.amount_ttc ?? f.amount_ht ?? null;

// ---------------------------------------------------------------------------
// Verdict 1 — accounting
// ---------------------------------------------------------------------------

/**
 * Can this be booked? The question is whether the document evidences an
 * identifiable transaction, not whether it is perfect.
 *
 * Deliberately permissive. A till receipt with a date, an amount and a
 * description is bookable; it simply may not support a VAT claim. Refusing to
 * book real expenditure because the paperwork is thin is how a set of accounts
 * stops matching the business.
 */
function reviewAccounting(f: DocumentFacts, ctx: ReviewContext): Verdict {
  const reasons: Reason[] = [];
  let fatal = 0;

  if (!f.supplier_name && f.doc_type !== "bank_statement") {
    reasons.push(
      r(
        "ACC_NO_COUNTERPARTY",
        "Contrepartie non identifiable : le document ne porte pas de nom de fournisseur.",
        "Counterparty not identifiable: the document carries no supplier name.",
        true,
        {
          citation: "Une écriture comptable doit identifier sa contrepartie",
          authority: "Principe comptable OHADA",
          jurisdiction: "CM",
          effective_from: "2000-01-01",
          status: "verified",
        },
      ),
    );
    fatal++;
  }

  if (!f.invoice_date) {
    reasons.push(
      r(
        "ACC_NO_DATE",
        "Date absente : l'exercice de rattachement ne peut pas être déterminé.",
        "No date: the period the entry belongs to cannot be determined.",
        true,
        {
          citation: "Une écriture doit être rattachée à un exercice",
          authority: "Principe comptable OHADA",
          jurisdiction: "CM",
          effective_from: "2000-01-01",
          status: "verified",
        },
      ),
    );
    fatal++;
  }

  if (f.amount_ht === null && f.amount_ttc === null) {
    reasons.push(
      r(
        "ACC_NO_AMOUNT",
        "Aucun montant lisible.",
        "No readable amount.",
        true,
        {
          citation: "Une écriture doit porter un montant",
          authority: "Principe comptable OHADA",
          jurisdiction: "CM",
          effective_from: "2000-01-01",
          status: "verified",
        },
      ),
    );
    fatal++;
  }

  if (!f.itemised) {
    reasons.push(
      r(
        "ACC_NOT_ITEMISED",
        "Prestation ou marchandise non détaillée : l'imputation comptable devra être justifiée autrement.",
        "Goods or services not itemised: the account allocation will need justifying another way.",
        false,
      ),
    );
  }

  if (!ctx.accounting_framework) {
    reasons.push(
      r(
        "ACC_FRAMEWORK_UNKNOWN",
        "Référentiel comptable non renseigné : il détermine le traitement et ne se déduit pas du régime fiscal.",
        "Accounting framework not recorded: it determines the treatment and does not follow from the tax regime.",
        false,
      ),
    );
  } else if (ctx.accounting_framework === "smt") {
    reasons.push(
      r(
        "ACC_SMT_CASH_BASIS",
        "Système minimal de trésorerie : l'écriture suit l'encaissement ou le décaissement, non la facture.",
        "Minimal treasury system: the entry follows the cash movement, not the invoice.",
        false,
      ),
    );
  }

  if (fatal > 0) {
    // Failed, and still recorded — the practitioner's distinction, enforced.
    reasons.push(
      r(
        "ACC_RECORDED_ANYWAY",
        "Document conservé malgré le défaut : la dépense est enregistrée et le défaut est documenté.",
        "Document kept despite the defect: the expenditure is recorded and the defect documented.",
        false,
      ),
    );
    return settle("accounting", "fail", reasons);
  }

  return settle("accounting", reasons.length > 0 ? "partial" : "pass", reasons);
}

// ---------------------------------------------------------------------------
// Verdict 2 — charge deductibility
// ---------------------------------------------------------------------------

/**
 * Is the expense deductible against taxable profit?
 *
 * Note what is NOT asserted here. The 100,000 cash rule is verified as a
 * condition of the VAT deduction; whether it equally bars the CHARGE is a
 * separate question we have not traced to a text. So it is raised as an
 * unverified decisive reason, which `settle` turns into `indeterminate` rather
 * than a refusal. Telling a client an expense is non-deductible on a rule we have
 * not read would be exactly the invented regulation CLAUDE.md forbids.
 */
function reviewChargeDeductibility(f: DocumentFacts, _ctx: ReviewContext): Verdict {
  const reasons: Reason[] = [];

  if (f.doc_type === "sales_invoice" || f.doc_type === "bank_statement") {
    return settle("charge_deductibility", "not_applicable", [
      r(
        "CHG_NOT_A_CHARGE",
        "Ce document ne constate pas une charge.",
        "This document does not evidence an expense.",
        false,
      ),
    ]);
  }

  if (!f.business_purpose_stated) {
    reasons.push(
      r(
        "CHG_PURPOSE_UNCLEAR",
        "Lien avec l'exploitation non apparent. La charge doit être nécessaire à l'activité — appréciation du praticien.",
        "Business purpose not apparent. The expense must be necessary to the activity — a practitioner's judgement.",
        false,
        {
          citation: "La dépense doit être nécessaire à l'exploitation",
          authority: "DGI — Fiche TVA",
          url: "https://www.impots.cm/sites/default/files/documents/FICHE%20TVA.pdf",
          jurisdiction: "CM",
          effective_from: "2000-01-01",
          status: "verified",
        },
      ),
    );
  }

  const amount = testableAmount(f);
  if (
    f.payment_method === "cash" &&
    amount !== null &&
    amount >= CASH_DEDUCTION_THRESHOLD
  ) {
    reasons.push(
      r(
        "CHG_CASH_ABOVE_THRESHOLD",
        `Payé en espèces pour ${amount.toLocaleString("fr-FR")} FCFA, au-delà du seuil de ${CASH_DEDUCTION_THRESHOLD.toLocaleString("fr-FR")} FCFA. La règle est établie pour la TVA ; son effet sur la déductibilité de la charge reste à valider.`,
        `Paid in cash for ${amount.toLocaleString("en-US")} FCFA, above the ${CASH_DEDUCTION_THRESHOLD.toLocaleString("en-US")} FCFA threshold. The rule is established for VAT; its effect on the deductibility of the charge is still to be validated.`,
        true,
        {
          citation:
            "Effet du paiement en espèces au-delà de 100 000 FCFA sur la déductibilité de la charge",
          authority: "Non tracé à un texte — à valider",
          jurisdiction: "CM",
          effective_from: "2000-01-01",
          status: "unverified",
        },
      ),
    );
  }

  if (!isInvoiceGrade(f.doc_type) && f.doc_type !== "expense_receipt") {
    reasons.push(
      r(
        "CHG_WEAK_EVIDENCE",
        "Pièce justificative faible pour une charge : une facture en règle est préférable.",
        "Weak supporting document for an expense: a properly drawn invoice is preferable.",
        false,
      ),
    );
  }

  const unresolved = reasons.some((x) => x.decisive);
  if (unresolved) return settle("charge_deductibility", "fail", reasons);
  return settle("charge_deductibility", reasons.length > 0 ? "partial" : "pass", reasons);
}

// ---------------------------------------------------------------------------
// Verdict 3 — VAT recovery
// ---------------------------------------------------------------------------

/**
 * Is the input VAT recoverable? Three independent conditions, any one of which
 * denies it, and one of them is the check the practitioner did not mention.
 *
 *   a. The client must be a VAT collector. An IGS client reportedly is not.
 *   b. The supplier must be registered and under the régime du réel, NIU shown.
 *      An invoice from an IGS supplier carries no deductible VAT however well
 *      drawn up — and since IGS covers every business under 50M, that is a large
 *      share of a small client's purchases.
 *   c. For operations at or above 100,000 FCFA, not paid in cash. This one is
 *      verified from the DGI's own fact sheet, so it is the only one here that
 *      actually decides anything.
 */
function reviewVatRecovery(f: DocumentFacts, ctx: ReviewContext): Verdict {
  const reasons: Reason[] = [];

  if (f.doc_type === "bank_statement") {
    return settle("vat_recovery", "not_applicable", [
      r(
        "VAT_NOT_APPLICABLE",
        "Un relevé bancaire n'ouvre pas de droit à déduction.",
        "A bank statement does not give rise to a right of deduction.",
        false,
      ),
    ]);
  }

  // A sales invoice is about VAT collected, not recovered — but an IGS client
  // issuing a sales invoice bearing VAT is a defect worth catching.
  if (f.doc_type === "sales_invoice") {
    const def = ctx.client_regime ? regimeDef(ctx.client_regime) : undefined;
    if (def && !def.vatCollector && f.vat_amount !== null && f.vat_amount > 0) {
      return settle("vat_recovery", "fail", [
        r(
          "VAT_IGS_CLIENT_CHARGED_VAT",
          "Facture de vente portant de la TVA alors que le client relève de l'IGS, régime qui ne collecte pas la TVA. À vérifier d'urgence.",
          "Sales invoice carrying VAT while the client is under IGS, a regime that does not collect VAT. Check this urgently.",
          true,
          SUPPLIER_REGIME_RULE_SOURCE,
        ),
      ]);
    }
    return settle("vat_recovery", "not_applicable", [
      r(
        "VAT_OUTPUT_NOT_INPUT",
        "Facture de vente : il s'agit de TVA collectée, non déductible.",
        "Sales invoice: this is VAT collected, not recoverable.",
        false,
      ),
    ]);
  }

  // (a) Is the client even a VAT collector?
  if (ctx.client_regime) {
    const def = regimeDef(ctx.client_regime);
    if (def && !def.vatCollector) {
      return settle("vat_recovery", "fail", [
        r(
          "VAT_CLIENT_NOT_COLLECTOR",
          `Le client relève du régime « ${def.fr} », qui ne collecte pas la TVA : aucune TVA déductible sur ses achats.`,
          `The client is under the "${def.en}" regime, which does not collect VAT: no recoverable VAT on its purchases.`,
          true,
          def.source,
        ),
      ]);
    }
  }

  // (b) Supplier NIU, and the supplier's regime.
  if (!f.supplier_niu) {
    reasons.push(
      r(
        "VAT_NO_SUPPLIER_NIU",
        "NIU du fournisseur absent : la TVA n'est pas déductible sans facture mentionnant le NIU du fournisseur.",
        "Supplier NIU absent: VAT is not deductible without an invoice bearing the supplier's NIU.",
        true,
        {
          citation:
            "TVA déductible figurant sur une facture mentionnant le NIU du fournisseur immatriculé",
          authority: "DGI — Fiche TVA",
          url: "https://www.impots.cm/sites/default/files/documents/FICHE%20TVA.pdf",
          jurisdiction: "CM",
          effective_from: "2000-01-01",
          status: "verified",
        },
      ),
    );
  }

  if (f.supplier_regime && f.supplier_regime !== "unknown" && f.supplier_regime !== "reel") {
    const sup = regimeDef(f.supplier_regime);
    reasons.push(
      r(
        "VAT_SUPPLIER_NOT_REEL",
        `Fournisseur relevant du régime « ${sup?.fr ?? f.supplier_regime} » : la TVA n'est déductible que sur une facture d'un fournisseur soumis au régime du réel. Aucune TVA récupérable sur cette facture, quelle que soit sa régularité.`,
        `Supplier under the "${sup?.en ?? f.supplier_regime}" regime: VAT is only deductible on an invoice from a supplier subject to the real regime. No recoverable VAT on this invoice, however regular it is.`,
        true,
        SUPPLIER_REGIME_RULE_SOURCE,
      ),
    );
  } else if (!f.supplier_regime || f.supplier_regime === "unknown") {
    reasons.push(
      r(
        "VAT_SUPPLIER_REGIME_UNKNOWN",
        "Régime du fournisseur inconnu. Rien sur la facture ne l'indique, et il conditionne la déductibilité : à vérifier avant toute déduction.",
        "Supplier's regime unknown. Nothing on the invoice shows it, and it governs deductibility: check before deducting.",
        false,
        SUPPLIER_REGIME_RULE_SOURCE,
      ),
    );
  }

  // (c) The cash threshold — verified, and therefore decisive.
  const amount = testableAmount(f);
  if (amount !== null && amount >= CASH_DEDUCTION_THRESHOLD) {
    if (f.payment_method === "cash") {
      reasons.push(
        r(
          "VAT_CASH_ABOVE_THRESHOLD",
          `Opération de ${amount.toLocaleString("fr-FR")} FCFA payée en espèces : au-delà de ${CASH_DEDUCTION_THRESHOLD.toLocaleString("fr-FR")} FCFA, le droit à déduction n'est admis que si l'opération n'a pas été réglée en espèces.`,
          `Operation of ${amount.toLocaleString("en-US")} FCFA paid in cash: at or above ${CASH_DEDUCTION_THRESHOLD.toLocaleString("en-US")} FCFA the right to deduct is allowed only if the operation was not settled in cash.`,
          true,
          CASH_RULE_SOURCE,
        ),
      );
    } else if (!f.payment_method || f.payment_method === "unknown") {
      reasons.push(
        r(
          "VAT_PAYMENT_METHOD_UNKNOWN",
          `Opération de ${amount.toLocaleString("fr-FR")} FCFA : le mode de paiement conditionne la déduction au-delà de ${CASH_DEDUCTION_THRESHOLD.toLocaleString("fr-FR")} FCFA. À établir.`,
          `Operation of ${amount.toLocaleString("en-US")} FCFA: above ${CASH_DEDUCTION_THRESHOLD.toLocaleString("en-US")} FCFA the payment method governs the deduction. To be established.`,
          false,
          CASH_RULE_SOURCE,
        ),
      );
    }
  }

  // Rate presentation. Not a condition of deduction, but a reconciliation trap.
  if (f.vat_rate_shown !== null && !rateMatches(f.vat_rate_shown)) {
    reasons.push(
      r(
        "VAT_RATE_UNEXPECTED",
        `Taux de TVA affiché de ${(f.vat_rate_shown * 100).toFixed(2).replace(".", ",")} % : le taux général est de ${VAT.label} (17,5 % + 10 % de CAC). Vérifier s'il s'agit d'une exonération, d'un taux zéro ou d'une erreur.`,
        `VAT rate shown as ${(f.vat_rate_shown * 100).toFixed(2)}%: the general rate is ${VAT.label} (17.5% plus 10% CAC). Check whether this is an exemption, a zero rate, or an error.`,
        false,
        VAT.source,
      ),
    );
  }

  const blocked = reasons.some((x) => x.decisive);
  if (blocked) return settle("vat_recovery", "fail", reasons);
  return settle("vat_recovery", reasons.length > 0 ? "partial" : "pass", reasons);
}

// ---------------------------------------------------------------------------
// The practitioner's mention checklist
// ---------------------------------------------------------------------------

/**
 * Her list, as given. These are completeness observations, not verdicts: the
 * authoritative list of mandatory mentions is set by the CGI, which we have not
 * read directly, so none of them is decisive on its own. The one exception is the
 * supplier NIU, which is independently required by the verified VAT rule and is
 * therefore handled as a decisive reason in verdict 3.
 */
export function missingMentions(f: DocumentFacts): Reason[] {
  if (!isInvoiceGrade(f.doc_type)) return [];
  const out: Reason[] = [];
  const add = (code: string, fr: string, en: string) => out.push(r(code, fr, en, false));

  if (!f.supplier_name) add("MEN_SUPPLIER_NAME", "Raison sociale du fournisseur", "Supplier's registered name");
  if (!f.supplier_address) add("MEN_SUPPLIER_ADDRESS", "Adresse du fournisseur", "Supplier's address");
  if (!f.supplier_contact) add("MEN_SUPPLIER_CONTACT", "Coordonnées du fournisseur", "Supplier's contact details");
  if (!f.supplier_niu) add("MEN_SUPPLIER_NIU", "NIU du fournisseur", "Supplier's NIU");
  if (!f.customer_name) add("MEN_CUSTOMER_NAME", "Raison sociale du client", "Customer's registered name");
  if (!f.customer_niu) add("MEN_CUSTOMER_NIU", "NIU du client (requis entre professionnels)", "Customer's NIU (required between businesses)");
  if (!f.itemised) add("MEN_ITEMISED", "Description détaillée des biens ou services", "Itemised description of the goods or services");
  if (!f.invoice_number) add("MEN_INVOICE_NUMBER", "Numéro de facture", "Invoice number");
  if (!f.invoice_date) add("MEN_INVOICE_DATE", "Date de la facture", "Invoice date");
  if (f.amount_ht === null) add("MEN_AMOUNT_HT", "Montant hors taxes (HT)", "Amount excluding tax (HT)");
  if (f.vat_rate_shown === null) add("MEN_VAT_RATE", `Taux de TVA applicable (${VAT.label})`, `Applicable VAT rate (${VAT.label})`);
  if (!f.payment_method || f.payment_method === "unknown") add("MEN_PAYMENT_METHOD", "Mode de paiement", "Method of payment");

  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function reviewDocument(f: DocumentFacts, ctx: ReviewContext): DocumentReview {
  return {
    verdicts: [
      reviewAccounting(f, ctx),
      reviewChargeDeductibility(f, ctx),
      reviewVatRecovery(f, ctx),
    ],
    recorded: true,
    missingMentions: missingMentions(f),
  };
}

/** Does anything here need a practitioner before the file can move on? */
export const needsPractitioner = (review: DocumentReview): boolean =>
  review.verdicts.some((v) => v.requiresHumanDecision || v.value === "fail");

export const verdictLabel: Record<VerdictKind, { fr: string; en: string }> = {
  accounting: { fr: "Comptabilité", en: "Accounting" },
  charge_deductibility: { fr: "Déductibilité de la charge", en: "Charge deductibility" },
  vat_recovery: { fr: "TVA déductible", en: "VAT recovery" },
};

export const valueLabel: Record<VerdictValue, { fr: string; en: string }> = {
  pass: { fr: "Recevable", en: "Passes" },
  partial: { fr: "Recevable avec réserve", en: "Passes with a reservation" },
  fail: { fr: "Non recevable", en: "Does not pass" },
  indeterminate: { fr: "À trancher", en: "Needs a decision" },
  not_applicable: { fr: "Sans objet", en: "Not applicable" },
};
