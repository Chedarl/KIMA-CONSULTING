/**
 * Demonstration data only — blueprint rule 7: realistic, clearly identified
 * demonstration data, development environments only.
 *
 * Nothing here is a real taxpayer, a real declaration or a real tax figure. The
 * accountant is fictitious and deliberately not the practitioner interviewed in
 * the blueprint, so demo data can never be mistaken for a real engagement.
 *
 * No amount here was computed from a tax rule, and none may be presented as
 * one. Every due date is unverified demo data: real deadlines must come from a
 * verified `tax_rule` carrying a legal source and effective date.
 *
 * Structure follows the request lifecycle documented in
 * docs/foundation/portal-patterns-research.md.
 */

import type { Locale } from "./i18n";

/**
 * A fixed "today" so the demo cannot drift into contradicting itself (a filed
 * return quietly becoming overdue, for example). Real code derives this from
 * the request clock with an explicit time zone.
 */
export const DEMO_TODAY = "2026-10-20";

const MS_PER_DAY = 86_400_000;

/** Days until `iso`. Negative means overdue. Date-only, UTC, no local drift. */
export function daysUntil(iso: string, from: string = DEMO_TODAY): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** My Day bucketing, after PwC Connect: overdue, due today, due within 7 days. */
export type DueBucket = "overdue" | "today" | "soon" | "later";

export function bucketOf(iso: string): DueBucket {
  const d = daysUntil(iso);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";
  return "later";
}

/* ---------------------------------------------------------------- statuses */

export type FilingEvidence = {
  reference: string;
  capturedOn: string;
  source: "official_receipt" | "authorized_integration";
};

/**
 * Filing status is evidence-gated **in the type**: there is no way to construct
 * a filed declaration without the evidence that proves it (Scenario F). A
 * declaration someone believes is filed but cannot prove is `awaitingEvidence`,
 * which is a different, visible thing.
 */
export type DeclarationState =
  | { kind: "draft" }
  | { kind: "estimated" }
  | { kind: "awaitingReview" }
  | { kind: "actionNeeded" }
  | { kind: "awaitingEvidence" }
  | { kind: "filed"; evidence: FilingEvidence };

/** Derived from DeclarationState so the two can never drift apart. */
export type StatusKind = "confirmed" | DeclarationState["kind"];

/** The request lifecycle. `returned` is first-class: work comes back. */
export type RequestStatus =
  | "requested"
  | "in_progress"
  | "in_client_review"
  | "returned"
  | "submitted"
  | "accepted";

/* ------------------------------------------------------- taxpayer requests */

export type DocumentRequest = {
  id: string;
  label: { fr: string; en: string };
  status: RequestStatus;
  responsible: "taxpayer" | "firm";
  dueOn: string;
  returnedCount: number;
  receivedOn?: string;
};

export const documentRequests: DocumentRequest[] = [
  {
    id: "dr-1",
    label: { fr: "Relevé bancaire — septembre", en: "Bank statement — September" },
    status: "requested",
    responsible: "taxpayer",
    dueOn: "2026-10-18",
    returnedCount: 0,
  },
  {
    id: "dr-2",
    label: { fr: "Justificatifs de frais", en: "Expense receipts" },
    status: "returned",
    responsible: "taxpayer",
    dueOn: "2026-10-20",
    returnedCount: 1,
  },
  {
    id: "dr-3",
    label: { fr: "Factures de ventes — septembre", en: "Sales invoices — September" },
    status: "accepted",
    responsible: "taxpayer",
    dueOn: "2026-10-10",
    returnedCount: 0,
    receivedOn: "2026-10-04",
  },
  {
    id: "dr-4",
    label: { fr: "Factures d'achats — septembre", en: "Purchase invoices — September" },
    status: "submitted",
    responsible: "taxpayer",
    dueOn: "2026-10-10",
    returnedCount: 0,
    receivedOn: "2026-10-04",
  },
  {
    id: "dr-5",
    label: { fr: "Rapprochement du grand livre", en: "Ledger reconciliation" },
    status: "in_progress",
    responsible: "firm",
    dueOn: "2026-10-24",
    returnedCount: 0,
  },
];

export const requestIsOpen = (s: RequestStatus) =>
  s === "requested" || s === "in_progress" || s === "in_client_review" || s === "returned";

/* ------------------------------------------------------------- obligations */

export type Obligation = {
  id: string;
  label: { fr: string; en: string };
  period: string;
  dueOn: string;
  state: DeclarationState;
};

export const obligations: Obligation[] = [
  {
    id: "ob-1",
    label: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    dueOn: "2026-10-24",
    state: { kind: "actionNeeded" },
  },
  {
    id: "ob-2",
    label: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-08",
    dueOn: "2026-09-24",
    // Filed, and the evidence is what makes it so.
    state: {
      kind: "filed",
      evidence: {
        reference: "ACK-2026-08-004127",
        capturedOn: "2026-09-22",
        source: "official_receipt",
      },
    },
  },
  {
    id: "ob-3",
    label: { fr: "DSF — exercice 2025", en: "DSF — financial year 2025" },
    period: "2025",
    dueOn: "2027-03-15",
    state: { kind: "draft" },
  },
];

/** The client-visible timeline — coarse by design; never the internal state. */
export const clientTimeline: {
  step: { fr: string; en: string };
  state: "done" | "current" | "todo";
}[] = [
  { step: { fr: "Pièces demandées", en: "Documents requested" }, state: "done" },
  { step: { fr: "Pièces reçues", en: "Documents received" }, state: "current" },
  { step: { fr: "En préparation", en: "In preparation" }, state: "todo" },
  { step: { fr: "En attente d'approbation", en: "Awaiting approval" }, state: "todo" },
  { step: { fr: "Déposé", en: "Filed" }, state: "todo" },
];

/* --------------------------------------------------------- firm workspace */

export type WorkspaceRow = {
  id: string;
  client: string;
  obligation: { fr: string; en: string };
  period: string;
  taxCentre: "DGE" | "CIME" | "CDI";
  dueOn: string;
  docsReceived: number;
  docsTotal: number;
  state: DeclarationState;
  preparedBy: string;
  reviewer: string | null;
  reviewerIsPool: boolean;
  returnedCount: number;
  mine: boolean;
};

/**
 * Deadlines differ by tax centre — 15 March for DGE, 15 April for CIME and CSI,
 * 15 May for CDI (verified: sage-dsf-ingestion-research.md section 1). The
 * monthly dates below are illustrative only and carry no verified rule.
 */
export const workspaceRows: WorkspaceRow[] = [
  {
    id: "d-1",
    client: "Boulangerie Le Palmier SARL",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    taxCentre: "CDI",
    dueOn: "2026-10-24",
    docsReceived: 3,
    docsTotal: 5,
    state: { kind: "actionNeeded" },
    preparedBy: "A. Nkeng",
    reviewer: null,
    reviewerIsPool: false,
    returnedCount: 1,
    mine: true,
  },
  {
    id: "d-2",
    client: "Transports Mbanga & Fils",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    taxCentre: "CIME",
    dueOn: "2026-10-22",
    docsReceived: 6,
    docsTotal: 6,
    state: { kind: "awaitingReview" },
    preparedBy: "A. Nkeng",
    reviewer: "P. Fotso",
    reviewerIsPool: true,
    returnedCount: 0,
    mine: true,
  },
  {
    id: "d-3",
    client: "Clinique Bonanjo SA",
    obligation: { fr: "DSF — système normal", en: "DSF — système normal" },
    period: "2025",
    taxCentre: "DGE",
    dueOn: "2026-03-15",
    docsReceived: 11,
    docsTotal: 14,
    state: { kind: "draft" },
    preparedBy: "A. Nkeng",
    reviewer: null,
    reviewerIsPool: false,
    returnedCount: 2,
    mine: true,
  },
  {
    id: "d-4",
    client: "Atelier Koné Couture",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-08",
    taxCentre: "CDI",
    dueOn: "2026-09-24",
    docsReceived: 4,
    docsTotal: 4,
    state: {
      kind: "filed",
      evidence: {
        reference: "ACK-2026-08-004127",
        capturedOn: "2026-09-22",
        source: "official_receipt",
      },
    },
    preparedBy: "A. Nkeng",
    reviewer: "P. Fotso",
    reviewerIsPool: true,
    returnedCount: 0,
    mine: false,
  },
  {
    id: "d-5",
    client: "Quincaillerie Etoudi",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    taxCentre: "CDI",
    dueOn: "2026-10-24",
    docsReceived: 2,
    docsTotal: 5,
    state: { kind: "actionNeeded" },
    preparedBy: "S. Abena",
    reviewer: null,
    reviewerIsPool: false,
    returnedCount: 0,
    mine: false,
  },
  {
    id: "d-6",
    client: "Pharmacie du Lac",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-08",
    taxCentre: "CIME",
    dueOn: "2026-09-22",
    docsReceived: 5,
    docsTotal: 5,
    // Submitted but the acknowledgment never arrived. This is the state the
    // product exists to make visible, and it is NOT "filed".
    state: { kind: "awaitingEvidence" },
    preparedBy: "S. Abena",
    reviewer: "P. Fotso",
    reviewerIsPool: true,
    returnedCount: 0,
    mine: false,
  },
];

/* ------------------------------------------------------------- the metrics */

/**
 * The three request metrics from PwC Connect, computed from the data rather
 * than asserted. Definitions in portal-patterns-research.md section 1.
 *
 * `returnedMoreThanOnce` measures our own clarity, not the client's diligence.
 */
export function workspaceMetrics(rows: WorkspaceRow[] = workspaceRows) {
  const overdue = rows.filter((r) => daysUntil(r.dueOn) < 0 && r.state.kind !== "filed");
  const averageDaysOverdue = overdue.length
    ? Math.round(overdue.reduce((sum, r) => sum + Math.abs(daysUntil(r.dueOn)), 0) / overdue.length)
    : 0;

  // On time compares the filing evidence date to the deadline — NOT to today.
  // Measuring against today would mark every past filing late forever.
  const settled = rows.filter((r) => r.state.kind === "filed");
  const onTime = settled.filter(
    (r) => r.state.kind === "filed" && daysUntil(r.dueOn, r.state.evidence.capturedOn) >= 0,
  );
  const onTimePct = settled.length ? Math.round((onTime.length / settled.length) * 100) : null;

  return {
    atRisk: rows.filter((r) => {
      const b = bucketOf(r.dueOn);
      return (b === "overdue" || b === "today" || b === "soon") && r.state.kind !== "filed";
    }).length,
    averageDaysOverdue,
    overdueCount: overdue.length,
    onTimePct,
    returnedMoreThanOnce: rows.filter((r) => r.returnedCount > 1).length,
    clients: new Set(rows.map((r) => r.client)).size,
  };
}

/* -------------------------------------------------------------- intake */

export type QueueItem = {
  id: string;
  client: string | null;
  file: string;
  arrivedVia: "upload" | "email";
  arrivedAt: string;
};

/**
 * Upload links arrive already bound to a taxpayer, period and request. Email-in
 * arrives unbound and a human binds it before it becomes a document — see
 * sage-dsf-ingestion-research.md section 6.
 */
export const intakeQueue: QueueItem[] = [
  {
    id: "q-1",
    client: "Transports Mbanga & Fils",
    file: "releve-sept.pdf",
    arrivedVia: "upload",
    arrivedAt: "2026-10-20T11:04:00Z",
  },
  {
    id: "q-2",
    client: null,
    file: "IMG_20261018_0931.jpg",
    arrivedVia: "email",
    arrivedAt: "2026-10-20T10:52:00Z",
  },
  {
    id: "q-3",
    client: "Clinique Bonanjo SA",
    file: "balance-2025.xlsx",
    arrivedVia: "upload",
    arrivedAt: "2026-10-20T09:38:00Z",
  },
  {
    id: "q-4",
    client: null,
    file: "scan0042.pdf",
    arrivedVia: "email",
    arrivedAt: "2026-10-20T08:15:00Z",
  },
];

/** Fictitious. Deliberately not the practitioner named in the blueprint. */
export const demoAccountant = {
  initials: "AN",
  name: "A. Nkeng",
  firm: "Kima Consulting",
};

export function pick<T>(value: { fr: T; en: T }, locale: Locale): T {
  return value[locale];
}

/** Times are rendered in Douala, explicitly — never the viewer's local zone. */
export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CM" : "en-CM", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Douala",
  }).format(new Date(iso));
}

/* ------------------------------------------------- client workspace (demo) */

export type ClientAction = {
  id: string;
  label: { fr: string; en: string };
  kind: "upload" | "review" | "pay";
};

export const clientActions: ClientAction[] = [
  {
    id: "a-1",
    label: {
      fr: "Déposer le relevé bancaire d'octobre",
      en: "Upload the October bank statement",
    },
    kind: "upload",
  },
  {
    id: "a-2",
    label: {
      fr: "Confirmer vos informations d'identification fiscale",
      en: "Confirm your taxpayer identification details",
    },
    kind: "review",
  },
  {
    id: "a-3",
    label: { fr: "Approuver le devis de service Kima", en: "Approve the Kima service quotation" },
    kind: "review",
  },
];

export type ActivityEntry = {
  id: string;
  text: { fr: string; en: string };
  at: string;
};

/** Every entry reflects a real staff action — never an optimistic estimate. */
export const activityFeed: ActivityEntry[] = [
  {
    id: "ac-1",
    text: {
      fr: "Kima a examiné vos factures de ventes",
      en: "Kima reviewed your sales invoices",
    },
    at: "2026-10-20T10:42:00Z",
  },
  {
    id: "ac-2",
    text: {
      fr: "Votre déclaration de septembre est en revue finale",
      en: "Your September declaration is in final review",
    },
    at: "2026-10-19T16:05:00Z",
  },
  {
    id: "ac-3",
    text: { fr: "Nouveau message de Kima", en: "New message from Kima" },
    at: "2026-10-19T09:20:00Z",
  },
  {
    id: "ac-4",
    text: { fr: "Facture KMC-204 émise", en: "Invoice KMC-204 issued" },
    at: "2026-10-18T14:10:00Z",
  },
];

export const activeServices: { fr: string; en: string }[] = [
  { fr: "Déclarations mensuelles", en: "Monthly declarations" },
  { fr: "Préparation annuelle de la DSF", en: "Annual DSF preparation" },
];

export type ReadinessCategory = {
  label: { fr: string; en: string };
  state: "complete" | "partial" | "missing";
};

export const readinessCategories: ReadinessCategory[] = [
  { label: { fr: "Factures de ventes", en: "Sales invoices" }, state: "complete" },
  { label: { fr: "Factures d'achats", en: "Purchase invoices" }, state: "complete" },
  { label: { fr: "Relevés bancaires", en: "Bank statements" }, state: "missing" },
  { label: { fr: "Justificatifs de frais", en: "Expense receipts" }, state: "partial" },
];

export function readinessPercent(cats: ReadinessCategory[] = readinessCategories): number {
  const score = cats.reduce(
    (sum, c) => sum + (c.state === "complete" ? 1 : c.state === "partial" ? 0.5 : 0),
    0,
  );
  return Math.round((score / cats.length) * 100);
}

/**
 * The taxpayer's tax profile. `verified: false` is shown as "to verify" rather
 * than presented as established — classification must be confirmed against
 * current rules, never assumed (blueprint section 13).
 */
export const taxProfile = {
  niu: "P0582 •••• 417K",
  regime: { fr: "Régime du réel", en: "Real regime" },
  framework: { fr: "Système normal (SYSCOHADA révisé)", en: "Système normal (SYSCOHADA revised)" },
  centre: "CDI Douala I",
  verified: false,
};

/** The client-visible advisor. Fictitious, like every other demo person here. */
export const demoAdvisor = {
  initials: "AN",
  name: "A. Nkeng",
};
