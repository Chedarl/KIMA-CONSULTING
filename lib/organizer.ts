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
 *
 * REVISED after the 21 October 2026 practitioner session
 * (`docs/foundation/practitioner-notes-2026-10-21.md` §6). Three changes:
 *
 *   - The first question is now WHO the taxpayer is, not what their business is
 *     called. The practitioner proposed segmenting the portal by regime; regime
 *     is precisely what a visitor cannot reliably answer, and what a reviewer
 *     verifies afterwards. Taxpayer type they always know.
 *   - An individual (particulier) track exists: salary earners, students and
 *     voluntary income filers. This file previously required a registered
 *     business name, which an individual does not have.
 *   - The abolished regimes are gone from the choices. The impôt libératoire and
 *     the régime simplifié were replaced by the IGS under the 2025 Finance Law.
 */

import {
  TAXPAYER_TYPES,
  TAX_CENTRES,
  reconcileRegimeAndCentre,
  taxpayerType,
  type Regime,
  type TaxCentre,
  type TaxpayerType,
} from "./rules";

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
  /**
   * Restricts the question to one family of taxpayer. Absent means everyone.
   * An individual is never asked for a registered business name or a regime.
   */
  onlyFor?: "business" | "individual";
};

export const ORGANIZER: Question[] = [
  {
    // First, because everything else is scoped by it, and because it is the one
    // classification question a visitor can answer without a tax document in
    // front of them.
    key: "taxpayer_type",
    kind: "choice",
    required: true,
    fr: "Qui déclare ?",
    en: "Who is declaring?",
    helpFr:
      "Cela détermine les pièces que nous vous demanderons et le langage que nous employons.",
    helpEn: "This decides which documents we ask you for, and the language we use.",
    choices: TAXPAYER_TYPES.map((t) => ({ value: t.key, fr: t.fr, en: t.en })),
  },
  {
    key: "legal_name",
    kind: "text",
    required: true,
    onlyFor: "business",
    fr: "Raison sociale de l'entreprise",
    en: "Registered business name",
  },
  {
    key: "full_name",
    kind: "text",
    required: true,
    onlyFor: "individual",
    fr: "Nom et prénoms",
    en: "Full name",
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
    onlyFor: "business",
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
    onlyFor: "business",
    fr: "Régime fiscal déclaré",
    en: "Reported tax regime",
    helpFr: "Tel qu'il figure sur vos documents. Un réviseur le vérifiera.",
    helpEn: "As stated on your documents. A reviewer will verify it.",
    // Only the regimes in force. The impôt libératoire and the régime simplifié
    // were both replaced by the IGS under the 2025 Finance Law; offering them
    // would classify a client under a regime that no longer exists. They survive
    // in `lib/rules.ts` with an `effective_to` date, for historical periods.
    choices: [
      { value: "reel", fr: "Régime du réel", en: "Real regime" },
      {
        value: "igs",
        fr: "Impôt Général Synthétique (IGS)",
        en: "General Synthetic Tax (IGS)",
      },
      { value: "unknown", fr: "Je ne sais pas", en: "I do not know" },
    ],
  },
  {
    key: "accounting_framework",
    kind: "choice",
    onlyFor: "business",
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
    onlyFor: "business",
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
    onlyFor: "business",
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
    onlyFor: "business",
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
    onlyFor: "business",
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
    onlyFor: "business",
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

  // The individual track. The practitioner's "salary earners, students, and
  // people wishing to declare their PIT" — a segment this organizer previously
  // could not accept at all, since it demanded a registered business name.
  {
    key: "employer_name",
    kind: "text",
    onlyFor: "individual",
    fr: "Nom de votre employeur",
    en: "Your employer's name",
    helpFr: "Si vous êtes salarié. Sinon, laissez vide.",
    helpEn: "If you are an employee. Otherwise leave blank.",
  },
  {
    key: "other_income",
    kind: "choice",
    required: true,
    onlyFor: "individual",
    fr: "Avez-vous des revenus autres que votre salaire ?",
    en: "Do you have income other than your salary?",
    helpFr: "Loyers, honoraires, revenus d'une activité, intérêts.",
    helpEn: "Rent, fees, income from an activity, interest.",
    choices: [
      { value: "yes", fr: "Oui", en: "Yes" },
      { value: "no", fr: "Non", en: "No" },
    ],
  },
  {
    key: "dpr_access",
    kind: "choice",
    required: true,
    onlyFor: "individual",
    fr: "Accédez-vous déjà à votre déclaration pré-remplie sur le portail de la DGI ?",
    en: "Do you already have access to your pre-filled declaration on the DGI portal?",
    helpFr:
      "La DGI pré-remplit la déclaration annuelle des revenus. La connexion se fait avec votre NIU.",
    helpEn:
      "The DGI pre-fills the annual income declaration. Login uses your NIU.",
    choices: [
      { value: "yes", fr: "Oui", en: "Yes" },
      { value: "no", fr: "Non", en: "No" },
      { value: "unknown", fr: "Je ne sais pas", en: "I do not know" },
    ],
  },
];

/** Which family a recorded answer puts the taxpayer in. */
export function familyOf(answers: Record<string, string>): "business" | "individual" | null {
  const t = answers.taxpayer_type as TaxpayerType | undefined;
  if (!t) return null;
  return taxpayerType(t)?.family ?? null;
}

/**
 * The questions that actually apply. Asking a student for their registered
 * business name is how a portal tells someone it was not built for them.
 */
export function questionsFor(answers: Record<string, string>): Question[] {
  const family = familyOf(answers);
  return ORGANIZER.filter((q) => {
    if (!q.onlyFor) return true;
    // Before the first answer, show only the unscoped questions.
    if (!family) return false;
    return q.onlyFor === family;
  });
}

export type DerivedRequest = {
  key: string;
  fr: string;
  en: string;
  reasonFr: string;
  reasonEn: string;
  /**
   * Who fetches it. `firm` means the practitioner retrieves it from the DGI's
   * Harmony 2 portals and the client is never asked — see
   * `docs/foundation/harmony2-dgi-platform-research.md`. The practitioner listed
   * both of these among the things she asks clients for, and they are the two
   * most likely to stall: a client who has mislaid last year's DSF cannot
   * produce it at any speed, while the firm can fetch it in minutes.
   */
  retrievedBy?: "client" | "firm";
};

/**
 * The document checklist derived from the answers. Pure, so the derivation can
 * be explained to a client and audited by a reviewer. Documents only.
 */
export function deriveRequests(answers: Record<string, string>): DerivedRequest[] {
  const out: DerivedRequest[] = [];
  const family = familyOf(answers);

  // An individual is asked for almost nothing. Their annual declaration is
  // pre-filled by the DGI; our job is to help them check it, not to re-collect
  // what the state already holds.
  if (family === "individual") {
    if (answers.taxpayer_type !== "individual_none") {
      out.push({
        key: "income_statement",
        fr: "Bulletins de paie ou attestation de revenus",
        en: "Payslips or a statement of income",
        reasonFr: "Pour vérifier ce que la déclaration pré-remplie indique.",
        reasonEn: "To check what the pre-filled declaration shows.",
        retrievedBy: "client",
      });
    }
    if (answers.other_income === "yes") {
      out.push({
        key: "other_income_proof",
        fr: "Justificatifs de vos autres revenus",
        en: "Supporting documents for your other income",
        reasonFr: "Vous avez indiqué percevoir des revenus autres que votre salaire.",
        reasonEn: "You told us you receive income other than your salary.",
        retrievedBy: "client",
      });
    }
    out.push({
      key: "prior_declarations",
      fr: "Déclarations des exercices précédents",
      en: "Previous years' declarations",
      reasonFr:
        "Nous les récupérons nous-mêmes sur le portail de la DGI. Vous n'avez rien à fournir.",
      reasonEn:
        "We retrieve these ourselves from the DGI portal. You do not need to provide anything.",
      retrievedBy: "firm",
    });
    out.push({
      key: "tax_id_proof",
      fr: "Votre NIU",
      en: "Your NIU",
      reasonFr: "Il identifie votre dossier fiscal et sert à vous connecter au portail de la DGI.",
      reasonEn: "It identifies your tax file and is how you log in to the DGI portal.",
      retrievedBy: "client",
    });
    return out;
  }

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
    retrievedBy: "client",
  });

  // Retrieved by the firm, not asked of the client. These two came off her
  // request list once we established they are available on Harmony 2 under the
  // client's own login. They stay on the checklist — the work still has to be
  // done and the client should see that it is being done — but they no longer
  // sit in the count that blocks approval waiting on someone else.
  out.push({
    key: "prior_declarations",
    fr: "Déclarations des exercices précédents",
    en: "Previous periods' declarations",
    reasonFr:
      "Disponibles en ligne auprès de la DGI : nous nous en chargeons, vous n'avez rien à envoyer.",
    reasonEn:
      "Available online from the DGI: we handle these, you have nothing to send.",
    retrievedBy: "firm",
  });
  out.push({
    key: "previous_dsf",
    fr: "DSF de l'exercice précédent",
    en: "Previous year's DSF",
    reasonFr:
      "Disponible en ligne auprès de la DGI : nous nous en chargeons, vous n'avez rien à envoyer.",
    reasonEn:
      "Available online from the DGI: we handle this, you have nothing to send.",
    retrievedBy: "firm",
  });

  return out;
}

/** What the client is actually asked for — the firm's own retrievals excluded. */
export const clientRequests = (requests: DerivedRequest[]) =>
  requests.filter((x) => x.retrievedBy !== "firm");

/** What the firm fetches from Harmony 2 itself. */
export const firmRetrievals = (requests: DerivedRequest[]) =>
  requests.filter((x) => x.retrievedBy === "firm");

/**
 * What a reviewer must confirm. These are not obligations the questionnaire
 * decided — they are the gaps it detected and is explicitly refusing to guess.
 */
export function reviewerFlags(answers: Record<string, string>): { fr: string; en: string }[] {
  const flags: { fr: string; en: string }[] = [];
  const family = familyOf(answers);

  if (family === "individual") {
    if (answers.taxpayer_type === "individual_none") {
      flags.push({
        fr: "Contribuable déclarant n'avoir aucun revenu imposable : confirmer qu'aucune obligation déclarative ne s'applique avant de le lui dire.",
        en: "Taxpayer reports no taxable income: confirm that no filing obligation applies before telling them so.",
      });
    }
    flags.push({
      fr: "Déclaration pré-remplie : vérifier les données reprises par la DGI avant toute validation. Kima ne valide pas à la place du contribuable.",
      en: "Pre-filled declaration: check the data the DGI carried over before anything is validated. Kima does not validate on the taxpayer's behalf.",
    });
    return flags;
  }

  if (answers.tax_regime === "unknown" || answers.tax_centre === "unknown") {
    flags.push({
      fr: "Régime ou centre des impôts inconnu : à établir à partir du profil officiel du contribuable.",
      en: "Regime or tax centre unknown: to be established from the taxpayer's official profile.",
    });
  }

  // The two axes the practitioner session showed get conflated. An unusual
  // pairing is a question for the reviewer, never a correction we apply.
  const mismatch = reconcileRegimeAndCentre(
    (answers.tax_regime as Regime) || null,
    (answers.tax_centre as TaxCentre) || null,
  );
  if (mismatch) flags.push(mismatch);

  if (answers.accounting_framework === "unknown") {
    flags.push({
      fr: "Référentiel comptable à confirmer : il ne se déduit pas du régime fiscal.",
      en: "Accounting framework to confirm: it does not follow from the tax regime.",
    });
  }

  // IGS businesses at or above 10M turnover reportedly must keep accounts on the
  // SMT. Turnover is not asked here and an obligation may not be inferred from it
  // anyway — so this is a prompt for the reviewer, not a derivation.
  if (answers.tax_regime === "igs" && answers.accounting_framework === "normal") {
    flags.push({
      fr: "Régime IGS tenu en système normal : vérifier le référentiel applicable. Le système minimal de trésorerie serait requis à partir de 10 millions de chiffre d'affaires — à valider.",
      en: "IGS regime kept on the système normal: check the applicable framework. The minimal treasury system is reportedly required from 10 million turnover — to be validated.",
    });
  }

  if (answers.tax_regime === "igs") {
    flags.push({
      fr: "Régime IGS : l'IGS ne collecte pas la TVA et serait libératoire de la patente. Confirmer avant d'appliquer des obligations de TVA ou un renouvellement de patente.",
      en: "IGS regime: IGS does not collect VAT and is reportedly libératoire of the patente. Confirm before applying any VAT obligation or patente renewal.",
    });
  }

  flags.push({
    fr: "Obligations déclaratives applicables : à confirmer par un réviseur qualifié avant activation.",
    en: "Applicable filing obligations: to be confirmed by a qualified reviewer before activation.",
  });
  return flags;
}

/**
 * Kept for compatibility. The deadline now lives in the rule registry with its
 * source, its effective date and its prorogation handling — use
 * `resolveDsfDeadline` from `lib/rules.ts`, which also reports whether the date
 * can be relied on.
 */
export const TAX_CENTRE_DEADLINE: Record<string, string> = Object.fromEntries(
  TAX_CENTRES.map((c) => [c.key, c.dsfDeadline]),
);
