/**
 * The rule registry — every regulatory rule Kima applies, with its source.
 *
 * CLAUDE.md: "Never invent regulatory rules. Every tax rule carries a legal
 * source, jurisdiction, effective date and verification status. Unverified rules
 * stay inactive." This module is how that constraint is enforced in code rather
 * than hoped for in review: a rule is a value carrying its own provenance, and
 * `isActive` is derived from the provenance, not set by hand.
 *
 * The evidence behind every entry is `docs/foundation/cameroon-rule-corpus-research.md`.
 * Most of it lands at `inferred` — Cameroon tax commentary online is almost
 * entirely private practices selling tax services, and only impots.cm and the
 * finance laws are treated as authority here. An inferred rule is carried,
 * displayed, and explicitly NOT acted on. That is the intended outcome.
 *
 * THE AXIS SEPARATION THAT MATTERS. Three things are routinely conflated, and
 * our second practitioner session conflated two of them
 * (`docs/foundation/practitioner-notes-2026-10-21.md` §3, §6):
 *
 *   taxpayer type  — who they are. Known at sign-up. Drives the portal.
 *   tax regime     — réel or IGS. Drives WHICH obligations exist.
 *   tax centre     — DGE / CIME / CDI. Drives WHEN the DSF is due.
 *
 * They correlate strongly and are not the same variable. An IGS taxpayer is
 * normally at a CDI, so "IGS files on 15 May" is right in practice and wrong in
 * mechanism — and wrong exactly for the mixed cases a firm already gets wrong by
 * hand. Plus the accounting framework, which CLAUDE.md already forbids inferring
 * from the regime. Four axes, kept apart.
 *
 * Pure data and pure functions, so any date or finding can be explained without
 * running the application.
 */

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * `verified` — an official DGI publication or a legislative text was read.
 * `inferred` — independent secondary sources agree; no official text read.
 * `unverified` — a single source, or sources that disagree.
 */
export type VerificationStatus = "verified" | "inferred" | "unverified";

export type RuleSource = {
  /** How a practitioner would cite it. */
  citation: string;
  authority: string;
  url?: string;
  jurisdiction: "CM";
  /** ISO date the rule took effect. */
  effective_from: string;
  /** ISO date it ceased to apply, where it has. */
  effective_to?: string;
  status: VerificationStatus;
};

/**
 * Only a verified rule may be acted on. This is the whole constraint, in one
 * function, so it cannot be forgotten at a call site.
 */
export const isActive = (s: RuleSource): boolean => s.status === "verified";

/** Is this rule in force for the period being worked on, rather than today? */
export function inForce(s: RuleSource, onDate: string): boolean {
  if (onDate < s.effective_from) return false;
  if (s.effective_to && onDate > s.effective_to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Money and rates
// ---------------------------------------------------------------------------

/**
 * XAF is a zero-decimal currency: amounts are whole francs held as integers.
 * Never a float — CLAUDE.md, "money and dates are exact".
 */
export type Xaf = number;

export const VAT = {
  /** 17.5% principal plus 10% centimes additionnels communaux ON the principal. */
  principal: 0.175,
  cac: 0.1,
  /** 0.175 * 1.10 = 0.19250 exactly. */
  effective: 0.1925,
  label: "19,25 %",
  source: {
    citation: "Taux général de TVA : 17,5 % + 10 % CAC",
    authority: "DGI — Fiche TVA",
    url: "https://www.impots.cm/sites/default/files/documents/FICHE%20TVA.pdf",
    jurisdiction: "CM",
    effective_from: "2000-01-01",
    status: "verified",
  } as RuleSource,
} as const;

/**
 * At or above this amount, paying in cash denies the right to deduct the VAT.
 *
 * The practitioner gave this as a documentation preference ("cash acceptable
 * below, bank above"). The DGI's own fact sheet is stricter: it is a condition of
 * the right to deduct, and no VAT credit refund is admitted on cash-paid
 * invoices. The stricter official reading is the one implemented.
 */
export const CASH_DEDUCTION_THRESHOLD: Xaf = 100_000;

export const CASH_RULE_SOURCE: RuleSource = {
  citation:
    "Opérations d'au moins 100 000 FCFA : droit à déduction admis à condition que l'opération n'ait pas été payée en espèces",
  authority: "DGI — Fiche TVA",
  url: "https://www.impots.cm/sites/default/files/documents/FICHE%20TVA.pdf",
  jurisdiction: "CM",
  effective_from: "2000-01-01",
  status: "verified",
};

/**
 * Input VAT is deductible only from a supplier registered AND taxed under the
 * régime du réel, with their NIU on the invoice.
 *
 * Consequence, and it is the highest-value check in the system: an invoice from
 * an IGS supplier carries NO deductible VAT however well drawn up. Since IGS now
 * covers every business under 50M turnover, that is a large share of a small
 * client's purchases — and nothing on the face of an invoice announces it.
 *
 * Held `inferred` pending a direct reading of the governing CGI article. Acting
 * on it wrongly tells a client to write off VAT they were entitled to, so it
 * surfaces as an advisory and does not decide anything.
 */
export const SUPPLIER_REGIME_RULE_SOURCE: RuleSource = {
  citation:
    "TVA déductible figurant sur une facture délivrée par un fournisseur immatriculé et soumis au régime du réel, mentionnant son NIU",
  authority: "DGI — Fiche TVA, et commentaire concordant",
  url: "https://www.impots.cm/sites/default/files/documents/FICHE%20TVA.pdf",
  jurisdiction: "CM",
  effective_from: "2000-01-01",
  status: "inferred",
};

// ---------------------------------------------------------------------------
// Axis 1 — taxpayer type. Known at sign-up; drives the portal.
// ---------------------------------------------------------------------------

/**
 * The practitioner proposed splitting the portal by regime, with salary earners
 * and students under "IGS → physical person". Two objections, both fatal to that
 * arrangement and neither fatal to her intent (notes §6):
 *
 *   - A salary earner is not an IGS taxpayer. IGS taxes business activity; an
 *     employee's income tax is IRPP withheld at source.
 *   - Regime is unknown at sign-up. It is what a reviewer verifies afterwards.
 *     A front door that demands it asks the one question the visitor cannot
 *     answer, and a wrong answer poisons everything downstream.
 *
 * So the top axis is who the taxpayer is, which they always know. Regime becomes
 * a verified attribute of business taxpayers only. Her groupings all survive.
 */
export type TaxpayerType =
  | "business_moral"
  | "business_physical"
  | "individual_salary"
  | "individual_none"
  | "individual_pit";

export type TaxpayerTypeDef = {
  key: TaxpayerType;
  family: "business" | "individual";
  fr: string;
  en: string;
  helpFr: string;
  helpEn: string;
  /** Does the regime question apply at all? False for every individual. */
  carriesRegime: boolean;
};

export const TAXPAYER_TYPES: TaxpayerTypeDef[] = [
  {
    key: "business_moral",
    family: "business",
    fr: "Personne morale",
    en: "Moral person",
    helpFr: "Société immatriculée : SARL, SA, et autres.",
    helpEn: "A registered company: SARL, SA, and others.",
    carriesRegime: true,
  },
  {
    key: "business_physical",
    family: "business",
    fr: "Personne physique exerçant une activité",
    en: "Physical person carrying on a business",
    helpFr: "Entreprise individuelle, commerçant, profession libérale.",
    helpEn: "Sole trader, merchant, liberal profession.",
    carriesRegime: true,
  },
  {
    key: "individual_salary",
    family: "individual",
    fr: "Salarié",
    en: "Salary earner",
    helpFr: "Votre IRPP est retenu à la source par votre employeur.",
    helpEn: "Your income tax is withheld at source by your employer.",
    carriesRegime: false,
  },
  {
    key: "individual_none",
    family: "individual",
    fr: "Étudiant ou sans revenu imposable",
    en: "Student or no taxable income",
    helpFr: "Le plus souvent, aucune déclaration n'est due. Nous vous le confirmerons.",
    helpEn: "Most often nothing is due. We will confirm it for you.",
    carriesRegime: false,
  },
  {
    key: "individual_pit",
    family: "individual",
    fr: "Particulier souhaitant déclarer ses revenus",
    en: "Individual wishing to declare their income",
    helpFr:
      "La DGI propose une déclaration annuelle pré-remplie. Nous vous aidons à la vérifier.",
    helpEn:
      "The DGI offers a pre-filled annual declaration. We help you check it before you validate it.",
    carriesRegime: false,
  },
];

export const taxpayerType = (k: TaxpayerType) =>
  TAXPAYER_TYPES.find((t) => t.key === k);

// ---------------------------------------------------------------------------
// Axis 2 — tax regime. Drives WHICH obligations exist.
// ---------------------------------------------------------------------------

export type Regime = "reel" | "igs" | "liberatoire" | "simplifie";

export type RegimeDef = {
  key: Regime;
  fr: string;
  en: string;
  /** Turnover band, for orientation only — it never decides a classification. */
  turnoverFr: string;
  turnoverEn: string;
  /** Is this a VAT collector? An IGS taxpayer is reportedly not. */
  vatCollector: boolean;
  source: RuleSource;
  /** Replaced by, where abolished. */
  supersededBy?: Regime;
};

/**
 * IGS — Impôt Général Synthétique — was created by the 2025 Finance Law and
 * replaced BOTH the impôt libératoire AND the régime simplifié.
 *
 * Our own organizer was offering both abolished regimes as current choices. A
 * client picking one today would be classified under a regime that no longer
 * exists. They are kept, not deleted: blueprint §3.7 requires previous rule
 * versions to be preserved for historical periods, so a 2024 engagement stays
 * reproducible. `effective_to` makes them unavailable for a current period.
 */
export const REGIMES: RegimeDef[] = [
  {
    key: "reel",
    fr: "Régime du réel",
    en: "Real regime",
    turnoverFr: "Chiffre d'affaires supérieur à 50 millions FCFA",
    turnoverEn: "Turnover above 50 million FCFA",
    vatCollector: true,
    source: {
      citation: "Régime du réel — chiffre d'affaires supérieur à 50 millions FCFA",
      authority: "Commentaire concordant ; seuil non lu dans le texte officiel",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
  {
    key: "igs",
    fr: "Impôt Général Synthétique (IGS)",
    en: "General Synthetic Tax (IGS)",
    turnoverFr:
      "Chiffre d'affaires jusqu'à 50 millions FCFA — 30 millions pour les professions libérales",
    turnoverEn:
      "Turnover up to 50 million FCFA — 30 million for the liberal professions",
    vatCollector: false,
    source: {
      citation:
        "Impôt Général Synthétique, créé par la loi de finances 2025, en remplacement de l'impôt libératoire et du régime simplifié",
      authority: "Loi de finances 2025 ; détail issu de commentaire concordant",
      jurisdiction: "CM",
      effective_from: "2025-01-01",
      status: "inferred",
    },
  },
  {
    key: "liberatoire",
    fr: "Impôt libératoire (supprimé)",
    en: "Flat-rate tax (abolished)",
    turnoverFr: "Régime supprimé — remplacé par l'IGS",
    turnoverEn: "Abolished regime — replaced by IGS",
    vatCollector: false,
    supersededBy: "igs",
    source: {
      citation: "Impôt libératoire, remplacé par l'IGS",
      authority: "Loi de finances 2025",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      effective_to: "2024-12-31",
      status: "inferred",
    },
  },
  {
    key: "simplifie",
    fr: "Régime simplifié (supprimé)",
    en: "Simplified regime (abolished)",
    turnoverFr: "Régime supprimé — remplacé par l'IGS",
    turnoverEn: "Abolished regime — replaced by IGS",
    vatCollector: false,
    supersededBy: "igs",
    source: {
      citation: "Régime simplifié d'imposition, remplacé par l'IGS",
      authority: "Loi de finances 2025",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      effective_to: "2024-12-31",
      status: "inferred",
    },
  },
];

export const regime = (k: Regime) => REGIMES.find((r) => r.key === k);

/** Regimes a client may select for a period — abolished ones drop out. */
export const selectableRegimes = (onDate: string) =>
  REGIMES.filter((r) => inForce(r.source, onDate));

// ---------------------------------------------------------------------------
// Axis 3 — tax centre. Drives WHEN the DSF is due.
// ---------------------------------------------------------------------------

export type TaxCentre = "DGE" | "CIME" | "CDI";

export type TaxCentreDef = {
  key: TaxCentre;
  fr: string;
  en: string;
  /** Statutory DSF deadline as MM-DD. Subject to prorogation — see below. */
  dsfDeadline: string;
  /** Electronic filing reportedly mandatory for the specialised units. */
  electronicFilingRequired: boolean;
  source: RuleSource;
};

/**
 * The practitioner's correction was right on all three dates and wrong on the
 * mechanism: she labelled the third row "IGS", a regime, where the governing
 * variable is the centre (CDI).
 *
 * The official position is messier than the three-date split suggests. impots.cm
 * states 15 March for the DSF, and a 2019 ministerial communiqué extended that
 * year to 30 June. The split is well attested in practice; the only official date
 * citable is 15 March. Hence `inferred` on all three, and hence every resolved
 * DSF date carries `needsConfirmation`.
 */
export const TAX_CENTRES: TaxCentreDef[] = [
  {
    key: "DGE",
    fr: "DGE — Direction des grandes entreprises",
    en: "DGE — Large taxpayers directorate",
    dsfDeadline: "03-15",
    electronicFilingRequired: true,
    source: {
      citation: "Dépôt de la DSF au plus tard le 15 mars pour les contribuables de la DGE",
      authority: "Commentaire concordant ; impots.cm indique le 15 mars",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
  {
    key: "CIME",
    fr: "CIME — Centre des impôts des moyennes entreprises",
    en: "CIME — Medium enterprises tax centre",
    dsfDeadline: "04-15",
    electronicFilingRequired: true,
    source: {
      citation: "Dépôt de la DSF au plus tard le 15 avril pour les contribuables du CIME",
      authority: "Commentaire concordant",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
  {
    key: "CDI",
    fr: "CDI — Centre divisionnaire des impôts",
    en: "CDI — Divisional tax centre",
    dsfDeadline: "05-15",
    electronicFilingRequired: false,
    source: {
      citation: "Dépôt de la DSF au plus tard le 15 mai pour les contribuables des CDI",
      authority: "Commentaire concordant",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
];

export const taxCentre = (k: TaxCentre) => TAX_CENTRES.find((c) => c.key === k);

/**
 * The regime/centre reconciliation. Not an error — a question.
 *
 * A CDI taxpayer under the réel is perfectly possible and is exactly the case
 * where collapsing the two axes produces a wrong date. So an unusual pair is
 * surfaced for a human to confirm, never corrected automatically.
 */
export function reconcileRegimeAndCentre(
  r: Regime | null,
  c: TaxCentre | null,
): { fr: string; en: string } | null {
  if (!r || !c) return null;
  if (r === "igs" && c !== "CDI") {
    return {
      fr: `Régime IGS avec rattachement ${c} : combinaison inhabituelle. L'IGS concerne les entreprises jusqu'à 50 millions, normalement rattachées à un CDI. À confirmer sur le profil officiel.`,
      en: `IGS regime attached to ${c}: an unusual pairing. IGS covers businesses up to 50 million, normally attached to a CDI. Confirm against the official profile.`,
    };
  }
  if (r === "reel" && c === "CDI") {
    return {
      fr: "Régime du réel avec rattachement CDI : possible, mais l'échéance DSF suit le centre (15 mai), non le régime. À confirmer.",
      en: "Real regime attached to a CDI: possible, but the DSF deadline follows the centre (15 May), not the regime. Confirm.",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Obligations and the compliance calendar
// ---------------------------------------------------------------------------

export type Cadence = "monthly" | "quarterly" | "annual";

export type DueRule =
  | { kind: "day-after-period"; days: number }
  | { kind: "fixed"; monthDay: string }
  | { kind: "end-of-february" };

export type Obligation = {
  code: string;
  fr: string;
  en: string;
  cadence: Cadence;
  /** Regimes it applies to. Empty means it is not regime-dependent. */
  regimes: Regime[];
  /** Taxpayer types it applies to. Empty means all. */
  taxpayerTypes: TaxpayerType[];
  /**
   * Statutory due date. `day-after-period` gives a day-of-month in the month
   * following the period; `fixed` gives MM-DD; `end-of-february` is the patente,
   * which moves in a leap year.
   */
  due: DueRule;
  source: RuleSource;
  noteFr?: string;
  noteEn?: string;
};

export const OBLIGATIONS: Obligation[] = [
  {
    code: "VAT_MONTHLY",
    fr: "Déclaration et paiement de la TVA",
    en: "VAT declaration and payment",
    cadence: "monthly",
    regimes: ["reel"],
    taxpayerTypes: ["business_moral", "business_physical"],
    due: { kind: "day-after-period", days: 15 },
    noteFr:
      "Due même en l'absence d'opérations sur la période. Une absence d'activité ne dispense pas de déclarer.",
    noteEn:
      "Due even where there were no operations in the period. No activity does not excuse not declaring.",
    source: {
      citation: "Déclaration mensuelle de TVA, au plus tard le 15 du mois suivant",
      authority: "Commentaire citant l'article 142 du CGI",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
  {
    code: "IS_INSTALMENT_MONTHLY",
    fr: "Acompte mensuel d'impôt sur les sociétés",
    en: "Monthly corporate income tax instalment",
    cadence: "monthly",
    regimes: ["reel"],
    taxpayerTypes: ["business_moral", "business_physical"],
    due: { kind: "day-after-period", days: 15 },
    noteFr: "2 % du chiffre d'affaires mensuel HT, majoré de 10 % de CAC, soit 2,2 %.",
    noteEn: "2% of monthly turnover excluding tax plus 10% CAC, giving 2.2%.",
    source: {
      citation:
        "Acompte mensuel d'IS de 2,2 % du CA mensuel HT, au plus tard le 15 du mois suivant",
      authority: "Commentaire concordant",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
  {
    code: "PAYROLL_IRPP_MONTHLY",
    fr: "IRPP des salariés retenu à la source",
    en: "Employee income tax withheld at source",
    cadence: "monthly",
    regimes: [],
    taxpayerTypes: ["business_moral", "business_physical"],
    due: { kind: "day-after-period", days: 15 },
    source: {
      citation: "Reversement de l'IRPP salarial au plus tard le 15 du mois suivant",
      authority: "Commentaire concordant",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
  {
    code: "IGS_QUARTERLY",
    fr: "Paiement trimestriel de l'IGS",
    en: "Quarterly IGS payment",
    cadence: "quarterly",
    regimes: ["igs"],
    taxpayerTypes: ["business_moral", "business_physical"],
    due: { kind: "day-after-period", days: 15 },
    noteFr:
      "Dans les quinze jours suivant la fin du trimestre : 15 avril, 15 juillet, 15 octobre, 15 janvier. Peut aussi être acquitté en un versement annuel au plus tard le 15 avril.",
    noteEn:
      "Within fifteen days of the quarter end: 15 April, 15 July, 15 October, 15 January. May instead be paid in one annual instalment by 15 April.",
    source: {
      citation:
        "IGS acquitté trimestriellement dans les quinze jours suivant la fin de chaque trimestre, ou annuellement au plus tard le 15 avril",
      authority: "Commentaire concordant",
      jurisdiction: "CM",
      effective_from: "2025-01-01",
      status: "inferred",
    },
  },
  {
    code: "DSF_ANNUAL",
    fr: "Déclaration statistique et fiscale (DSF)",
    en: "Statistical and tax declaration (DSF)",
    cadence: "annual",
    regimes: [],
    taxpayerTypes: ["business_moral", "business_physical"],
    // Resolved from the tax centre, not from here — see resolveDsfDeadline.
    due: { kind: "fixed", monthDay: "03-15" },
    noteFr:
      "L'échéance dépend du centre de rattachement : DGE 15 mars, CIME 15 avril, CDI 15 mai. À confirmer chaque année au regard du communiqué en vigueur.",
    noteEn:
      "The deadline depends on the tax centre: DGE 15 March, CIME 15 April, CDI 15 May. Confirm each year against the communiqué in force.",
    source: {
      citation: "Transmission de la DSF au plus tard le 15 mars, sauf prorogation",
      authority: "DGI — impots.cm",
      url: "https://www.impots.cm/fr/actualites/declarations-statistiques-et-fiscales",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
  {
    code: "PATENTE_RENEWAL",
    fr: "Renouvellement de la patente",
    en: "Business licence (patente) renewal",
    cadence: "annual",
    regimes: ["reel"],
    taxpayerTypes: ["business_moral", "business_physical"],
    due: { kind: "end-of-february" },
    noteFr:
      "Le « renouvellement » signalé en entretien. Le paiement de l'IGS serait libératoire de la patente : les contribuables IGS n'y seraient donc pas soumis — à valider.",
    noteEn:
      'The "renouvellement" reported in interview. IGS payment is said to be libératoire of the patente, so IGS taxpayers would not owe it — to be validated.',
    source: {
      citation: "Renouvellement de la patente au plus tard le dernier jour de février",
      authority: "DGI — calendrier fiscal, citant l'article C23 du CGI",
      url: "https://www.impots.cm/fr/calendrier-fiscal",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "verified",
    },
  },
  {
    code: "IRPP_ANNUAL",
    fr: "Déclaration annuelle des revenus (IRPP)",
    en: "Annual income declaration (IRPP)",
    cadence: "annual",
    regimes: [],
    taxpayerTypes: ["individual_salary", "individual_pit"],
    due: { kind: "fixed", monthDay: "03-15" },
    noteFr:
      "La DGI propose une déclaration pré-remplie sur dpr.harmony2.cm. Kima aide à la vérifier ; la DGI la reçoit.",
    noteEn:
      "The DGI offers a pre-filled declaration at dpr.harmony2.cm. Kima helps check it; the DGI receives it.",
    source: {
      citation: "Déclaration annuelle des revenus des particuliers",
      authority: "DGI — guide d'utilisateur, déclaration annuelle des particuliers",
      url: "https://www.impots.cm/sites/default/files/documents/Guide%20d'utilisateur%20de%CC%81claration%20annuelle%20des%20particuliers_082146.pdf",
      jurisdiction: "CM",
      effective_from: "2000-01-01",
      status: "inferred",
    },
  },
];

/** The obligations that apply to a taxpayer — never derived from turnover. */
export function obligationsFor(input: {
  type: TaxpayerType;
  regime: Regime | null;
}): Obligation[] {
  return OBLIGATIONS.filter((o) => {
    if (o.taxpayerTypes.length && !o.taxpayerTypes.includes(input.type)) return false;
    if (o.regimes.length) {
      if (!input.regime) return false;
      if (!o.regimes.includes(input.regime)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Prorogations — routine, so first-class
// ---------------------------------------------------------------------------

/**
 * Deadline extensions are not exceptional in Cameroon. The Minister of Finance
 * may extend declaration and payment deadlines under article 16 of the 2025
 * Finance Law, and does so most years: 15 March moved to 27 March in 2023, the
 * 2019 DSF extended to 30 June, the 2026 IGS payment reportedly moved to 30 April.
 *
 * A compliance product that renders a statutory date as fixed truth will be
 * visibly wrong several times a year in the one place clients are watching. So a
 * prorogation is data, it carries its own communiqué reference, and a resolved
 * date always says which of the two it came from.
 *
 * A prorogation with no communiqué reference is not a prorogation.
 */
export type Prorogation = {
  obligation_code: string;
  /** Period it applies to, e.g. "2026" or "2026-03". */
  period: string;
  /** Narrowing to one centre, where the communiqué does. */
  tax_centre?: TaxCentre;
  statutory_date: string;
  prorogued_to: string;
  communique_reference: string;
  status: VerificationStatus;
};

export type ResolvedDate = {
  date: string;
  basis: "statutory" | "prorogation";
  /** True where the date may not be relied on without a human check. */
  needsConfirmation: boolean;
  reasonFr: string;
  reasonEn: string;
  communique?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

const lastDayOfFebruary = (year: number) => {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-02-${leap ? "29" : "28"}`;
};

/** Statutory date for an obligation in a period, before any prorogation. */
export function statutoryDate(
  o: Obligation,
  period: { year: number; month?: number; quarter?: number },
): string {
  if (o.due.kind === "end-of-february") return lastDayOfFebruary(period.year);
  if (o.due.kind === "fixed") return `${period.year}-${o.due.monthDay}`;

  // day-after-period: the 15th of the month following the period's end.
  const day = pad(o.due.days);
  if (o.cadence === "monthly" && period.month) {
    const m = period.month === 12 ? 1 : period.month + 1;
    const y = period.month === 12 ? period.year + 1 : period.year;
    return `${y}-${pad(m)}-${day}`;
  }
  if (o.cadence === "quarterly" && period.quarter) {
    // Q1 ends March, due 15 April; Q4 ends December, due 15 January of N+1.
    const endMonth = period.quarter * 3;
    const m = endMonth === 12 ? 1 : endMonth + 1;
    const y = endMonth === 12 ? period.year + 1 : period.year;
    return `${y}-${pad(m)}-${day}`;
  }
  // A period was given that this cadence cannot place. Say so rather than
  // inventing a plausible date — a wrong deadline is worse than no deadline.
  return "";
}

const prorogationResult = (p: Prorogation, statutory: string): ResolvedDate => ({
  date: p.prorogued_to,
  basis: "prorogation",
  needsConfirmation: p.status !== "verified",
  communique: p.communique_reference,
  reasonFr: `Échéance statutaire du ${statutory} prorogée au ${p.prorogued_to} (${p.communique_reference}).`,
  reasonEn: `Statutory deadline of ${statutory} extended to ${p.prorogued_to} (${p.communique_reference}).`,
});

/**
 * The DSF deadline, from the centre — the axis that actually governs it.
 *
 * Always returns `needsConfirmation`, even absent a prorogation, because the
 * three-date split rests on secondary commentary while the only citable official
 * date is 15 March, and because prorogations are routine.
 */
export function resolveDsfDeadline(
  centre: TaxCentre | null,
  year: number,
  prorogations: Prorogation[] = [],
): ResolvedDate | null {
  if (!centre) return null;
  const def = taxCentre(centre);
  if (!def) return null;
  const statutory = `${year}-${def.dsfDeadline}`;

  const p = prorogations.find(
    (x) =>
      x.obligation_code === "DSF_ANNUAL" &&
      x.period === String(year) &&
      (!x.tax_centre || x.tax_centre === centre) &&
      x.status !== "unverified",
  );
  if (p) return prorogationResult(p, statutory);

  return {
    date: statutory,
    basis: "statutory",
    needsConfirmation: true,
    reasonFr: `Échéance du centre ${centre}. À confirmer au regard du communiqué de l'exercice : les prorogations sont fréquentes.`,
    reasonEn: `Deadline for the ${centre} centre. Confirm against this year's communiqué: extensions are frequent.`,
  };
}

/** Same resolution for any obligation. */
export function resolveDueDate(
  o: Obligation,
  period: { year: number; month?: number; quarter?: number },
  prorogations: Prorogation[] = [],
): ResolvedDate {
  const statutory = statutoryDate(o, period);
  const key = period.month
    ? `${period.year}-${pad(period.month)}`
    : String(period.year);

  const p = prorogations.find(
    (x) => x.obligation_code === o.code && x.period === key && x.status !== "unverified",
  );
  if (p) return prorogationResult(p, statutory);

  return {
    date: statutory,
    basis: "statutory",
    needsConfirmation: !isActive(o.source),
    reasonFr: isActive(o.source)
      ? `Échéance statutaire : ${o.source.citation}.`
      : `Échéance indicative, source non officielle : ${o.source.citation}. À valider.`,
    reasonEn: isActive(o.source)
      ? `Statutory deadline: ${o.source.citation}.`
      : `Indicative deadline from a non-official source: ${o.source.citation}. To be validated.`,
  };
}

// ---------------------------------------------------------------------------
// Harmony 2 — the DGI's platform, as a retrieval source and nothing more
// ---------------------------------------------------------------------------

/**
 * CLAUDE.md: "Never claim government integration." There is no evidence of a
 * public Harmony 2 API, so this is configuration describing where a human goes,
 * never a client. See `docs/foundation/harmony2-dgi-platform-research.md`.
 *
 * The product value is narrow and real: documents the firm can retrieve itself
 * come OFF the client's request list. Two of the practitioner's six asks —
 * prior declarations and the previous DSF — are among them, and they are the two
 * most likely to stall, because a client who has mislaid last year's DSF cannot
 * produce it at any speed.
 */
export type HarmonyPortal = {
  key: string;
  host: string;
  fr: string;
  en: string;
  status: VerificationStatus;
};

export const HARMONY_PORTALS: HarmonyPortal[] = [
  {
    key: "sso",
    host: "sso.harmony2.cm",
    fr: "Authentification unique — connexion par NIU et mot de passe",
    en: "Single sign-on — login with NIU and password",
    status: "verified",
  },
  {
    key: "dpr",
    host: "dpr.harmony2.cm",
    fr: "Déclaration pré-remplie des revenus (IRPP)",
    en: "Pre-filled income declaration (IRPP)",
    status: "verified",
  },
  {
    key: "bef",
    host: "bef.harmony2.cm",
    fr: "Déclaration du bénéficiaire effectif (RCBE)",
    en: "Beneficial owner declaration (RCBE)",
    status: "verified",
  },
  {
    key: "sdc",
    host: "sdc.harmony2.cm",
    fr: "Synchronisation de compte et réinitialisation du mot de passe",
    en: "Account synchronisation and password reset",
    status: "inferred",
  },
  {
    key: "fanr",
    host: "fanr.harmony2.cm",
    fr: "Avis d'imposition",
    en: "Assessment notices",
    status: "inferred",
  },
  {
    key: "otp",
    host: "otp.dgi.cm",
    fr: "Paiement",
    en: "Payment",
    status: "inferred",
  },
];

/**
 * Documents the firm retrieves rather than requesting from the client. The
 * practitioner listed both among the things she asks clients for.
 */
export const FIRM_RETRIEVABLE_DOCUMENTS = ["prior_declarations", "previous_dsf"] as const;

export type FirmRetrievableDocument = (typeof FIRM_RETRIEVABLE_DOCUMENTS)[number];

export const isFirmRetrievable = (key: string): boolean =>
  (FIRM_RETRIEVABLE_DOCUMENTS as readonly string[]).includes(key);
