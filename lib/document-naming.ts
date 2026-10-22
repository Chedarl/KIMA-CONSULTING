/**
 * The Kima filing framework — one grammar, read in two directions.
 *
 * THE PROBLEM IT SOLVES. Documents arrive as `IMG_20260921_114502.jpg`,
 * `scan0001.pdf`, `WhatsApp Image 2026-09-21 at 11.45.02.jpeg`. Blueprint §3.1
 * and §3.3: records are scattered and archiving is weak. The practitioner
 * collects by WhatsApp and in person, and then somebody has to work out, for
 * every single file, whose it is, which period it belongs to, what it is, and
 * which obligation it feeds.
 *
 * Asking the client to fill that in is the obvious answer and it does not work.
 * Clients do not complete metadata forms; they send a photo and get on with
 * their day.
 *
 * THE IDEA: THE FOLDER IS THE FORM.
 *
 * A client will not fill in four fields, but they will drop a file in a folder.
 * So the folder tree carries the metadata, and it is generated from that
 * client's own obligations — a réel client gets monthly folders, an IGS client
 * gets quarterly ones, nobody gets a folder for a tax they do not pay. Where a
 * file lands decides what it is called; and a name, read backwards, says exactly
 * which folder it belongs in. Same grammar, two directions.
 *
 * THREE THINGS THIS BUYS THAT A FOLDER TREE ALONE DOES NOT.
 *
 *   1. The name survives the system. A document named by this framework is
 *      self-describing on a USB stick, in an email attachment, or in the
 *      Evidence Vault in 2032. That is the archiving problem in §3.3.
 *   2. An empty folder is a finding. The tree is built from obligations, so a
 *      bucket that should have documents and does not is a visible gap before
 *      the deadline rather than a discovery after it.
 *   3. A reference can be spoken and typed. It carries a check character, so a
 *      number read down a phone line or retyped into an email is caught when it
 *      is wrong instead of silently pointing at another document.
 *
 * WHAT IS DELIBERATELY NOT IN THE NAME: the NIU. It would be the obvious key,
 * and it is exactly what we should not scatter across filenames, email
 * attachments and WhatsApp threads — see R-36. A short derived taxpayer code
 * identifies the file within the firm without broadcasting the number that
 * currently opens the client's portal.
 *
 * Pure functions. A reference can be explained, and parsed, without the app.
 */

import {
  obligationsFor,
  type Cadence,
  type Regime,
  type TaxpayerType,
} from "./rules";
import type { DocumentType } from "./document-review";

// ---------------------------------------------------------------------------
// Document classes
// ---------------------------------------------------------------------------

/**
 * Three letters, French mnemonics, because the jurisdiction's paperwork is
 * French and a practitioner reading `ACH` on a folder already knows what it is.
 * The code is canonical and never translated — a reference that changed with
 * the interface language would stop being a reference. The labels translate.
 */
export type DocClass =
  | "ACH"
  | "VEN"
  | "DEP"
  | "BNQ"
  | "PAI"
  | "DEC"
  | "DSF"
  | "CPT"
  | "PRV"
  | "COR"
  | "IDF";

export type DocClassDef = {
  code: DocClass;
  fr: string;
  en: string;
  /** What belongs here, in the client's words, not ours. */
  helpFr: string;
  helpEn: string;
  /** How it is reviewed, when it is reviewed. */
  reviewAs: DocumentType;
  /** Obligations this class feeds — drives which folders get created. */
  feeds: string[];
  /** Does the firm retrieve it from Harmony 2 rather than ask the client? */
  firmRetrieved?: boolean;
};

export const DOC_CLASSES: DocClassDef[] = [
  {
    code: "ACH",
    fr: "Factures d'achat",
    en: "Purchase invoices",
    helpFr: "Ce que vous avez acheté : factures de vos fournisseurs.",
    helpEn: "What you bought: invoices from your suppliers.",
    reviewAs: "purchase_invoice",
    feeds: ["VAT_MONTHLY", "DSF_ANNUAL"],
  },
  {
    code: "VEN",
    fr: "Factures de vente",
    en: "Sales invoices",
    helpFr: "Ce que vous avez vendu : les factures que vous avez émises.",
    helpEn: "What you sold: the invoices you issued.",
    reviewAs: "sales_invoice",
    feeds: ["VAT_MONTHLY", "IS_INSTALMENT_MONTHLY", "IGS_QUARTERLY", "DSF_ANNUAL"],
  },
  {
    code: "DEP",
    fr: "Dépenses et reçus",
    en: "Expenses and receipts",
    helpFr: "Petites dépenses, reçus, tickets. Même s'ils ne sont pas parfaits.",
    helpEn: "Small expenses, receipts, tickets. Even imperfect ones.",
    reviewAs: "expense_receipt",
    feeds: ["DSF_ANNUAL"],
  },
  {
    code: "BNQ",
    fr: "Relevés bancaires et Mobile Money",
    en: "Bank and Mobile Money statements",
    helpFr: "Vos relevés de compte, y compris Mobile Money professionnel.",
    helpEn: "Your account statements, including business Mobile Money.",
    reviewAs: "bank_statement",
    feeds: ["DSF_ANNUAL"],
  },
  {
    code: "PAI",
    fr: "Paie et déclarations sociales",
    en: "Payroll and social declarations",
    helpFr: "Bulletins de paie, états du personnel, cotisations.",
    helpEn: "Payslips, staff schedules, contributions.",
    reviewAs: "other",
    feeds: ["PAYROLL_IRPP_MONTHLY", "DSF_ANNUAL"],
  },
  {
    code: "DEC",
    fr: "Déclarations déposées",
    en: "Filed declarations",
    helpFr: "Nous les récupérons en ligne auprès de la DGI.",
    helpEn: "We retrieve these online from the DGI.",
    reviewAs: "other",
    feeds: ["VAT_MONTHLY", "IGS_QUARTERLY", "IRPP_ANNUAL"],
    firmRetrieved: true,
  },
  {
    code: "DSF",
    fr: "Déclaration statistique et fiscale",
    en: "Statistical and tax declaration",
    helpFr: "La DSF de l'exercice. Nous récupérons les précédentes en ligne.",
    helpEn: "The year's DSF. We retrieve previous ones online.",
    reviewAs: "other",
    feeds: ["DSF_ANNUAL"],
    firmRetrieved: true,
  },
  {
    code: "CPT",
    fr: "Exports comptables",
    en: "Accounting exports",
    helpFr: "Balance ou grand livre depuis Sage, Excel ou votre logiciel.",
    helpEn: "Trial balance or ledger from Sage, Excel or your software.",
    reviewAs: "other",
    feeds: ["DSF_ANNUAL"],
  },
  {
    code: "PRV",
    fr: "Preuves de dépôt",
    en: "Filing evidence",
    helpFr: "Accusés de réception, quittances, preuves de paiement.",
    helpEn: "Acknowledgements, receipts, proof of payment.",
    reviewAs: "other",
    feeds: [],
  },
  {
    code: "COR",
    fr: "Correspondance fiscale",
    en: "Tax correspondence",
    helpFr: "Courriers, avis d'imposition, demandes de l'administration.",
    helpEn: "Letters, assessment notices, requests from the administration.",
    reviewAs: "other",
    feeds: [],
  },
  {
    code: "IDF",
    fr: "Identité fiscale",
    en: "Tax identity",
    helpFr: "Attestation d'immatriculation, NIU, RCCM, statuts.",
    helpEn: "Registration certificate, NIU, RCCM, articles of association.",
    reviewAs: "other",
    feeds: [],
  },
];

export const docClass = (c: string): DocClassDef | undefined =>
  DOC_CLASSES.find((d) => d.code === c);

// ---------------------------------------------------------------------------
// Taxpayer code
// ---------------------------------------------------------------------------

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Deterministic, stable, and short. Not a hash anyone should rely on for secrecy. */
function fold(input: string, length: number): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[h % 36];
    h = Math.floor(h / 36) + 7;
  }
  return out;
}

/**
 * A short code for the taxpayer: six readable letters from their name, plus two
 * derived from the NIU so two similarly-named clients never collide.
 *
 * The NIU goes INTO the derivation and never into the output. The code
 * identifies the file; it does not disclose the number (R-36).
 */
export function taxpayerCode(legalName: string, niu: string | null): string {
  const letters = legalName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const stem = (letters || "CLIENT").slice(0, 6).padEnd(6, "X");
  return `${stem}${fold(`${letters}|${niu ?? ""}`, 2)}`;
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type Period =
  | { kind: "month"; year: number; month: number }
  | { kind: "quarter"; year: number; quarter: number }
  | { kind: "year"; year: number };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `2026M09`, `2026T3`, `2026A` — sortable, and unambiguous when spoken. */
export function periodToken(p: Period): string {
  if (p.kind === "month") return `${p.year}M${pad2(p.month)}`;
  if (p.kind === "quarter") return `${p.year}T${p.quarter}`;
  return `${p.year}A`;
}

export function parsePeriod(token: string): Period | null {
  const m = /^(\d{4})M(0[1-9]|1[0-2])$/.exec(token);
  if (m) return { kind: "month", year: Number(m[1]), month: Number(m[2]) };
  const q = /^(\d{4})T([1-4])$/.exec(token);
  if (q) return { kind: "quarter", year: Number(q[1]), quarter: Number(q[2]) };
  const y = /^(\d{4})A$/.exec(token);
  if (y) return { kind: "year", year: Number(y[1]) };
  return null;
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The period as a person would say it. Folders show this next to the token. */
export function periodLabel(p: Period, locale: "fr" | "en"): string {
  if (p.kind === "month") {
    const name = (locale === "fr" ? MONTHS_FR : MONTHS_EN)[p.month - 1];
    return `${name} ${p.year}`;
  }
  if (p.kind === "quarter") {
    return locale === "fr"
      ? `${p.quarter}ᵉ trimestre ${p.year}`
      : `Q${p.quarter} ${p.year}`;
  }
  return locale === "fr" ? `Exercice ${p.year}` : `Financial year ${p.year}`;
}

// ---------------------------------------------------------------------------
// The reference
// ---------------------------------------------------------------------------

export type KimaReference = {
  taxpayer: string;
  period: Period;
  docClass: DocClass;
  sequence: number;
};

/**
 * One character over base 36, derived from the rest of the reference.
 *
 * It exists because references get spoken, written on paper, and retyped into
 * emails. Without it a transposed digit silently names a different, real
 * document. With it, the wrong reference simply fails to resolve.
 */
export function checkCharacter(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const v = ALPHABET.indexOf(body[i]);
    sum += (v < 0 ? 35 : v) * (i + 2);
  }
  return ALPHABET[sum % 36];
}

export function buildReference(ref: KimaReference): string {
  const body = [
    "KM",
    ref.taxpayer,
    periodToken(ref.period),
    ref.docClass,
    String(ref.sequence).padStart(4, "0"),
  ].join("-");
  return `${body}${checkCharacter(body.replace(/-/g, ""))}`;
}

/** Returns null for anything that is not a valid, check-correct reference. */
export function parseReference(raw: string): KimaReference | null {
  const text = raw.trim().toUpperCase();
  const m = /^KM-([A-Z0-9]{8})-(\d{4}(?:M\d{2}|T\d|A))-([A-Z]{3})-(\d{4})([A-Z0-9])$/.exec(text);
  if (!m) return null;

  const [, taxpayer, periodTok, cls, seq, check] = m;
  const body = `KM-${taxpayer}-${periodTok}-${cls}-${seq}`;
  if (checkCharacter(body.replace(/-/g, "")) !== check) return null;

  const period = parsePeriod(periodTok);
  if (!period) return null;
  if (!docClass(cls)) return null;

  return { taxpayer, period, docClass: cls as DocClass, sequence: Number(seq) };
}

/**
 * The stored filename. The original name is never lost — it is kept alongside,
 * because CLAUDE.md requires imported source files to be preserved, and because
 * a client asking "where is the photo I sent on Tuesday" is asking about their
 * name for it, not ours.
 */
export function canonicalFilename(ref: KimaReference, originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot + 1).toLowerCase() : "";
  return ext ? `${buildReference(ref)}.${ext}` : buildReference(ref);
}

// ---------------------------------------------------------------------------
// Folders — generated from the client's own obligations
// ---------------------------------------------------------------------------

export type Bucket = {
  period: Period;
  docClass: DocClass;
  /** Folder name as it appears: the code, then what it means. */
  folderFr: string;
  folderEn: string;
  /** Obligations this bucket feeds, for the empty-folder finding. */
  feeds: string[];
  firmRetrieved: boolean;
};

const cadencePeriods = (cadence: Cadence, year: number): Period[] => {
  if (cadence === "monthly") {
    return Array.from({ length: 12 }, (_, i) => ({
      kind: "month" as const,
      year,
      month: i + 1,
    }));
  }
  if (cadence === "quarterly") {
    return [1, 2, 3, 4].map((quarter) => ({ kind: "quarter" as const, year, quarter }));
  }
  return [{ kind: "year" as const, year }];
};

/**
 * The folder tree for one taxpayer and one year.
 *
 * Built from `obligationsFor`, so it is a picture of what this client actually
 * owes: a réel client sees twelve monthly folders, an IGS client sees four
 * quarterly ones, an individual sees a single annual folder. Nobody is shown a
 * folder for a tax they do not pay, which is what makes an empty folder mean
 * something.
 */
export function bucketsFor(input: {
  type: TaxpayerType;
  regime: Regime | null;
  year: number;
}): Bucket[] {
  const obligations = obligationsFor({ type: input.type, regime: input.regime });
  const wanted = new Map<string, Bucket>();

  for (const cls of DOC_CLASSES) {
    // A class with no obligations behind it (identity, correspondence, evidence)
    // lives once a year, not once a month. Twelve empty folders for the articles
    // of association would teach people to ignore empty folders.
    const relevant = obligations.filter((o) => cls.feeds.includes(o.code));
    let cadence: Cadence | null = null;

    if (relevant.length > 0) {
      // The FINEST cadence, not every cadence. Purchase invoices feed both the
      // monthly VAT return and the annual DSF; that does not mean they are
      // filed twice. A document lives in exactly one folder — the most granular
      // period it has to be reported in — and the coarser obligations aggregate
      // from it. Filing September's invoices in both 2026M09 and 2026A is how a
      // set of books ends up double-counted.
      cadence = (["monthly", "quarterly", "annual"] as const).find((c) =>
        relevant.some((o) => o.cadence === c),
      ) ?? null;
    } else if (cls.feeds.length === 0) {
      cadence = "annual";
    }
    if (!cadence) continue;

    for (const period of cadencePeriods(cadence, input.year)) {
      const key = `${periodToken(period)}|${cls.code}`;
      if (wanted.has(key)) continue;
      wanted.set(key, {
        period,
        docClass: cls.code,
        folderFr: `${cls.code} — ${cls.fr}`,
        folderEn: `${cls.code} — ${cls.en}`,
        feeds: cls.feeds,
        firmRetrieved: Boolean(cls.firmRetrieved),
      });
    }
  }

  // Chronological, not alphabetical: "2026A" would otherwise sort before
  // "2026M01", putting the year's folder at the top of January.
  const startMonth = (p: Period) =>
    p.kind === "month" ? p.month : p.kind === "quarter" ? p.quarter * 3 - 2 : 13;

  return [...wanted.values()].sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year;
    const ma = startMonth(a.period);
    const mb = startMonth(b.period);
    if (ma !== mb) return ma - mb;
    return a.docClass.localeCompare(b.docClass);
  });
}

/** `ALUCAM3F/2026/2026M09/ACH — Factures d'achat` */
export function folderPath(
  taxpayer: string,
  bucket: Bucket,
  locale: "fr" | "en",
): string[] {
  const token = periodToken(bucket.period);
  return [
    taxpayer,
    String(bucket.period.year),
    token,
    locale === "fr" ? bucket.folderFr : bucket.folderEn,
  ];
}

// ---------------------------------------------------------------------------
// Reading what the client actually sent
// ---------------------------------------------------------------------------

export type Suggestion = {
  period?: Period;
  docClass?: DocClass;
  /** Why we guessed, shown to whoever confirms it. Never applied silently. */
  reasonFr: string;
  reasonEn: string;
};

const CLASS_HINTS: { pattern: RegExp; cls: DocClass }[] = [
  { pattern: /\b(achat|achats|fournisseur|purchase|supplier)\b/i, cls: "ACH" },
  { pattern: /\b(vente|ventes|client|sale|sales)\b/i, cls: "VEN" },
  { pattern: /\b(relev[eé]|bank|banque|mobile ?money|statement)\b/i, cls: "BNQ" },
  { pattern: /\b(paie|salaire|payroll|payslip|bulletin)\b/i, cls: "PAI" },
  { pattern: /\b(dsf)\b/i, cls: "DSF" },
  { pattern: /\b(d[eé]claration|declaration)\b/i, cls: "DEC" },
  { pattern: /\b(balance|grand ?livre|ledger|sage|export)\b/i, cls: "CPT" },
  { pattern: /\b(quittance|accus[eé]|acknowledg|preuve|receipt of filing)\b/i, cls: "PRV" },
  { pattern: /\b(avis|courrier|letter|correspondance)\b/i, cls: "COR" },
  { pattern: /\b(niu|rccm|statuts|immatriculation|registration)\b/i, cls: "IDF" },
  // Last, because the specific hints above are more informative than "facture".
  { pattern: /\b(facture|invoice)\b/i, cls: "ACH" },
  { pattern: /\b(re[çc]u|ticket|receipt)\b/i, cls: "DEP" },
];

/**
 * What the phone called it, read for clues.
 *
 * WhatsApp and camera filenames carry the date the photo was taken, which is
 * usually close enough to the period to be a good default — and a default the
 * client can correct in one tap beats an empty field they will not fill.
 *
 * A suggestion is never applied on its own. It is shown with its reason, and
 * somebody confirms. Guessing the period wrong files a document into the wrong
 * declaration, which is worse than asking.
 */
export function suggestFromFilename(filename: string): Suggestion {
  const reasonsFr: string[] = [];
  const reasonsEn: string[] = [];
  let period: Period | undefined;
  let cls: DocClass | undefined;

  // WhatsApp: "WhatsApp Image 2026-09-21 at ...". Camera: "IMG_20260921_...".
  // Scanners vary; a bare "2026-09" is also common in hand-typed names.
  const iso = /(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])?/.exec(filename);
  if (iso) {
    period = { kind: "month", year: Number(iso[1]), month: Number(iso[2]) };
    reasonsFr.push(`date ${iso[1]}-${iso[2]} lue dans le nom du fichier`);
    reasonsEn.push(`date ${iso[1]}-${iso[2]} read from the filename`);
  }

  for (const hint of CLASS_HINTS) {
    if (hint.pattern.test(filename)) {
      cls = hint.cls;
      const def = docClass(hint.cls);
      reasonsFr.push(`mot-clé reconnu : ${def?.fr.toLowerCase()}`);
      reasonsEn.push(`keyword recognised: ${def?.en.toLowerCase()}`);
      break;
    }
  }

  return {
    period,
    docClass: cls,
    reasonFr: reasonsFr.length
      ? `Proposition d'après ${reasonsFr.join(" et ")}. À confirmer.`
      : "Aucun indice dans le nom du fichier : à classer manuellement.",
    reasonEn: reasonsEn.length
      ? `Suggested from ${reasonsEn.join(" and ")}. To be confirmed.`
      : "No clue in the filename: to be filed by hand.",
  };
}

/**
 * Buckets that should hold something and do not.
 *
 * This is the payoff of generating folders from obligations. An empty `ACH`
 * folder for a month whose VAT falls due on the 15th is a gap worth raising now
 * — not a discovery made while preparing the declaration.
 */
export function emptyBuckets(
  buckets: Bucket[],
  counts: Record<string, number>,
): Bucket[] {
  return buckets.filter((b) => {
    if (b.firmRetrieved) return false;
    if (b.feeds.length === 0) return false;
    return (counts[`${periodToken(b.period)}|${b.docClass}`] ?? 0) === 0;
  });
}
