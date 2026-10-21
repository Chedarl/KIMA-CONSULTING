/**
 * The compliance organizer — Intuit Link's organizer, redesigned for Kima.
 *
 * A short questionnaire whose answers DERIVE the document checklist, so the
 * list a client sees reflects their actual business rather than a template
 * somebody remembered to apply.
 *
 * THE BOUNDARY THAT MATTERS: this derives **documents**, never **obligations**.
 * Which filings a taxpayer legally owes is confirmed against verified rules by
 * a qualified reviewer. A questionnaire may not decide it, and turnover alone
 * may never imply it (blueprint section 13). Regime and framework are recorded
 * as the client reports them and stay flagged unverified until a reviewer
 * confirms them against the taxpayer's official profile.
 */

export type Choice = { value: string; fr: string; en: string };

export type Question = {
  key: string;
  fr: string;
  en: string;
  helpFr?: string;
  helpEn?: string;
  kind: "choice" | "text" | "email";
  choices?: Choice[];
  required?: boolean;
};

export const ORGANIZER: Question[] = [
  {
    key: "legal_name",
    kind: "text",
    required: true,
    fr: "Raison sociale de l'entreprise",
    en: "Registered business name",
  },
  {
    key: "contact_name",
    kind: "text",
    required: true,
    fr: "Personne responsable",
    en: "Responsible person",
  },
  {
    key: "contact_email",
    kind: "email",
    required: true,
    fr: "Adresse e-mail de contact",
    en: "Contact email address",
    helpFr: "Nous y enverrons les demandes de pièces et les rappels.",
    helpEn: "We will send document requests and reminders here.",
  },
  {
    key: "niu",
    kind: "text",
    fr: "Numéro d'identifiant unique (NIU)",
    en: "Unique taxpayer number (NIU)",
    helpFr: "Si vous ne l'avez pas sous la main, laissez vide.",
    helpEn: "Leave blank if you do not have it to hand.",
  },
  {
    key: "tax_centre",
    kind: "choice",
    required: true,
    fr: "Centre des impôts de rattachement",
    en: "Tax centre",
    helpFr: "Il figure sur vos documents fiscaux et détermine vos échéances.",
    helpEn: "It appears on your tax documents, and it sets your deadlines.",
    choices: [
      { value: "DGE", fr: "DGE — Grandes entreprises", en: "DGE — Large enterprises" },
      { value: "CIME", fr: "CIME — Moyennes entreprises", en: "CIME — Medium enterprises" },
      { value: "CDI", fr: "CDI — Centre divisionnaire", en: "CDI — Divisional centre" },
      { value: "unknown", fr: "Je ne sais pas", en: "I do not know" },
    ],
  },
  {
    key: "tax_regime",
    kind: "choice",
    required: true,
    fr: "Régime fiscal déclaré",
    en: "Reported tax regime",
    helpFr: "Tel qu'il figure sur vos documents. Un réviseur le vérifiera.",
    helpEn: "As stated on your documents. A reviewer will verify it.",
    choices: [
      { value: "reel", fr: "Régime du réel", en: "Real regime" },
      { value: "simplifie", fr: "Régime simplifié", en: "Simplified regime" },
      { value: "liberatoire", fr: "Impôt libératoire", en: "Flat-rate tax" },
      { value: "unknown", fr: "Je ne sais pas", en: "I do not know" },
    ],
  },
  {
    key: "accounting_framework",
    kind: "choice",
    fr: "Référentiel comptable utilisé",
    en: "Accounting framework in use",
    helpFr: "Distinct du régime fiscal : les deux ne se déduisent pas l'un de l'autre.",
    helpEn: "Separate from the tax regime: neither follows from the other.",
    choices: [
      {
        value: "normal",
        fr: "Système normal (SYSCOHADA révisé)",
        en: "Système normal (SYSCOHADA revised)",
      },
      { value: "smt", fr: "Système minimal de trésorerie (SMT)", en: "Minimal treasury system (SMT)" },
      { value: "unknown", fr: "Je ne sais pas", en: "I do not know" },
    ],
  },
  {
    key: "has_bank",
    kind: "choice",
    required: true,
    fr: "L'entreprise a-t-elle un compte bancaire ou Mobile Money professionnel ?",
    en: "Does the business hold a bank or Mobile Money account?",
    choices: [
      { value: "yes", fr: "Oui", en: "Yes" },
      { value: "no", fr: "Non", en: "No" },
    ],
  },
  {
    key: "issues_invoices",
    kind: "choice",
    required: true,
    fr: "Émettez-vous des factures de vente ?",
    en: "Do you issue sales invoices?",
    choices: [
      { value: "yes", fr: "Oui", en: "Yes" },
      { value: "no", fr: "Non", en: "No" },
    ],
  },
  {
    key: "has_suppliers",
    kind: "choice",
    required: true,
    fr: "Recevez-vous des factures de fournisseurs ?",
    en: "Do you receive supplier invoices?",
    choices: [
      { value: "yes", fr: "Oui", en: "Yes" },
      { value: "no", fr: "Non", en: "No" },
    ],
  },
  {
    key: "has_payroll",
    kind: "choice",
    required: true,
    fr: "Avez-vous des salariés ?",
    en: "Do you have employees?",
    choices: [
      { value: "yes", fr: "Oui", en: "Yes" },
      { value: "no", fr: "Non", en: "No" },
    ],
  },
  {
    key: "uses_sage",
    kind: "choice",
    fr: "Votre comptabilité est-elle tenue dans un logiciel ?",
    en: "Is your accounting kept in software?",
    helpFr: "Cela change la façon dont nous récupérons vos données.",
    helpEn: "It changes how we collect your data.",
    choices: [
      { value: "sage", fr: "Sage", en: "Sage" },
      { value: "excel", fr: "Excel ou tableur", en: "Excel or a spreadsheet" },
      { value: "other", fr: "Autre logiciel", en: "Other software" },
      { value: "none", fr: "Pas de logiciel", en: "No software" },
    ],
  },
];

export type DerivedRequest = {
  key: string;
  fr: string;
  en: string;
  reasonFr: string;
  reasonEn: string;
};

/**
 * The document checklist derived from the answers. Pure, so the derivation can
 * be explained to a client and audited by a reviewer. Documents only.
 */
export function deriveRequests(answers: Record<string, string>): DerivedRequest[] {
  const out: DerivedRequest[] = [];

  if (answers.has_bank === "yes") {
    out.push({
      key: "bank_statement",
      fr: "Relevé bancaire ou Mobile Money",
      en: "Bank or Mobile Money statement",
      reasonFr: "Vous avez indiqué détenir un compte professionnel.",
      reasonEn: "You told us the business holds an account.",
    });
  }
  if (answers.issues_invoices === "yes") {
    out.push({
      key: "sales_invoices",
      fr: "Factures de vente de la période",
      en: "Sales invoices for the period",
      reasonFr: "Vous avez indiqué émettre des factures de vente.",
      reasonEn: "You told us you issue sales invoices.",
    });
  }
  if (answers.has_suppliers === "yes") {
    out.push({
      key: "purchase_invoices",
      fr: "Factures d'achats et reçus",
      en: "Purchase invoices and receipts",
      reasonFr: "Vous avez indiqué recevoir des factures fournisseurs.",
      reasonEn: "You told us you receive supplier invoices.",
    });
  }
  if (answers.has_payroll === "yes") {
    out.push({
      key: "payroll",
      fr: "États de paie et déclarations sociales",
      en: "Payroll records and social declarations",
      reasonFr: "Vous avez indiqué avoir des salariés.",
      reasonEn: "You told us you have employees.",
    });
  }
  if (answers.uses_sage === "sage") {
    out.push({
      key: "sage_export",
      fr: "Export de la balance depuis Sage",
      en: "Trial balance export from Sage",
      reasonFr: "Votre comptabilité est tenue dans Sage ; l'export accélère la préparation.",
      reasonEn: "Your accounting is kept in Sage; the export speeds up preparation.",
    });
  }

  // Always: identity, so the profile can be verified rather than assumed.
  out.push({
    key: "tax_id_proof",
    fr: "Attestation d'immatriculation ou document fiscal récent",
    en: "Registration certificate or a recent tax document",
    reasonFr: "Nécessaire pour vérifier votre profil fiscal au regard des règles en vigueur.",
    reasonEn: "Needed to verify your tax profile against the rules in force.",
  });

  return out;
}

/**
 * What a reviewer must confirm. These are not obligations the questionnaire
 * decided — they are the gaps it detected and is explicitly refusing to guess.
 */
export function reviewerFlags(answers: Record<string, string>): { fr: string; en: string }[] {
  const flags: { fr: string; en: string }[] = [];
  if (answers.tax_regime === "unknown" || answers.tax_centre === "unknown") {
    flags.push({
      fr: "Régime ou centre des impôts inconnu : à établir à partir du profil officiel du contribuable.",
      en: "Regime or tax centre unknown: to be established from the taxpayer's official profile.",
    });
  }
  if (answers.accounting_framework === "unknown") {
    flags.push({
      fr: "Référentiel comptable à confirmer : il ne se déduit pas du régime fiscal.",
      en: "Accounting framework to confirm: it does not follow from the tax regime.",
    });
  }
  flags.push({
    fr: "Obligations déclaratives applicables : à confirmer par un réviseur qualifié avant activation.",
    en: "Applicable filing obligations: to be confirmed by a qualified reviewer before activation.",
  });
  return flags;
}

export const TAX_CENTRE_DEADLINE: Record<string, string> = {
  DGE: "03-15",
  CIME: "04-15",
  CDI: "05-15",
};
