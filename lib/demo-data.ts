/**
 * Demonstration data only — blueprint rule 7: realistic, clearly identified
 * demonstration data, development environments only.
 *
 * Nothing here is a real taxpayer, a real declaration or a real tax figure.
 * Amounts are illustrative whole XAF francs. No value in this file was computed
 * from a tax rule, and none may be presented as one.
 */

import type { Locale } from "./i18n";

export type StatusKind =
  | "confirmed"
  | "draft"
  | "estimated"
  | "awaitingReview"
  | "filed"
  | "actionNeeded";

export type DocumentRequest = {
  id: string;
  label: { fr: string; en: string };
  received: boolean;
  responsible: "taxpayer" | "firm";
  receivedOn?: string;
};

export const documentRequests: DocumentRequest[] = [
  {
    id: "dr-1",
    label: { fr: "Relevé bancaire — septembre", en: "Bank statement — September" },
    received: false,
    responsible: "taxpayer",
  },
  {
    id: "dr-2",
    label: { fr: "Factures de ventes — septembre", en: "Sales invoices — September" },
    received: true,
    responsible: "taxpayer",
    receivedOn: "2026-10-04",
  },
  {
    id: "dr-3",
    label: { fr: "Factures d'achats — septembre", en: "Purchase invoices — September" },
    received: true,
    responsible: "taxpayer",
    receivedOn: "2026-10-04",
  },
  {
    id: "dr-4",
    label: { fr: "Justificatifs de frais", en: "Expense receipts" },
    received: false,
    responsible: "taxpayer",
  },
  {
    id: "dr-5",
    label: { fr: "Rapprochement du grand livre", en: "Ledger reconciliation" },
    received: false,
    responsible: "firm",
  },
];

export type Obligation = {
  id: string;
  label: { fr: string; en: string };
  period: string;
  dueInDays: number;
  status: StatusKind;
};

export const obligations: Obligation[] = [
  {
    id: "ob-1",
    label: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    dueInDays: 4,
    status: "actionNeeded",
  },
  {
    id: "ob-2",
    label: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-08",
    dueInDays: -26,
    status: "filed",
  },
  {
    id: "ob-3",
    label: { fr: "DSF — exercice 2026", en: "DSF — financial year 2026" },
    period: "2026",
    dueInDays: 147,
    status: "draft",
  },
];

/** The client-visible timeline. Deliberately coarse — it never exposes internal_status. */
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

export type WorkspaceRow = {
  id: string;
  client: string;
  obligation: { fr: string; en: string };
  period: string;
  taxCentre: "DGE" | "CIME" | "CDI";
  due: string;
  docsReceived: number;
  docsTotal: number;
  status: StatusKind;
  preparedBy: string;
  reviewer: string | null;
  reviewerIsPool: boolean;
  amount: number | null;
};

/**
 * Deadlines differ by tax centre — 15 March for DGE, 15 April for CIME and CSI,
 * 15 May for CDI (verified, see sage-dsf-ingestion-research.md section 1).
 */
export const workspaceRows: WorkspaceRow[] = [
  {
    id: "d-1",
    client: "Boulangerie Le Palmier SARL",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    taxCentre: "CDI",
    due: "2026-10-24",
    docsReceived: 3,
    docsTotal: 5,
    status: "actionNeeded",
    preparedBy: "I. Mbarga",
    reviewer: null,
    reviewerIsPool: false,
    amount: null,
  },
  {
    id: "d-2",
    client: "Transports Mbanga & Fils",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    taxCentre: "CIME",
    due: "2026-10-22",
    docsReceived: 6,
    docsTotal: 6,
    status: "awaitingReview",
    preparedBy: "I. Mbarga",
    reviewer: "A. Fotso",
    reviewerIsPool: true,
    amount: 486000,
  },
  {
    id: "d-3",
    client: "Clinique Bonanjo SA",
    obligation: { fr: "DSF — système normal", en: "DSF — système normal" },
    period: "2025",
    taxCentre: "DGE",
    due: "2027-03-15",
    docsReceived: 11,
    docsTotal: 14,
    status: "draft",
    preparedBy: "I. Mbarga",
    reviewer: null,
    reviewerIsPool: false,
    amount: null,
  },
  {
    id: "d-4",
    client: "Atelier Koné Couture",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-08",
    taxCentre: "CDI",
    due: "2026-09-24",
    docsReceived: 4,
    docsTotal: 4,
    status: "filed",
    preparedBy: "I. Mbarga",
    reviewer: "A. Fotso",
    reviewerIsPool: true,
    amount: 72500,
  },
  {
    id: "d-5",
    client: "Quincaillerie Etoudi",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    taxCentre: "CDI",
    due: "2026-10-24",
    docsReceived: 2,
    docsTotal: 5,
    status: "actionNeeded",
    preparedBy: "S. Abena",
    reviewer: null,
    reviewerIsPool: false,
    amount: null,
  },
  {
    id: "d-6",
    client: "Pharmacie du Lac",
    obligation: { fr: "Déclaration mensuelle", en: "Monthly declaration" },
    period: "2026-09",
    taxCentre: "CIME",
    due: "2026-10-22",
    docsReceived: 5,
    docsTotal: 5,
    status: "estimated",
    preparedBy: "S. Abena",
    reviewer: null,
    reviewerIsPool: false,
    amount: 310000,
  },
];

export type QueueItem = {
  id: string;
  client: string;
  file: string;
  arrivedVia: "upload" | "email";
  arrivedAt: string;
  bound: boolean;
};

/**
 * Upload links arrive already bound to a taxpayer, period and request.
 * Email-in arrives unbound and must be bound by a human before it becomes a
 * document — see sage-dsf-ingestion-research.md section 6.
 */
export const intakeQueue: QueueItem[] = [
  {
    id: "q-1",
    client: "Transports Mbanga & Fils",
    file: "releve-sept.pdf",
    arrivedVia: "upload",
    arrivedAt: "11:04",
    bound: true,
  },
  {
    id: "q-2",
    client: "—",
    file: "IMG_20261018_0931.jpg",
    arrivedVia: "email",
    arrivedAt: "10:52",
    bound: false,
  },
  {
    id: "q-3",
    client: "Clinique Bonanjo SA",
    file: "balance-2025.xlsx",
    arrivedVia: "upload",
    arrivedAt: "09:38",
    bound: true,
  },
  {
    id: "q-4",
    client: "—",
    file: "scan0042.pdf",
    arrivedVia: "email",
    arrivedAt: "08:15",
    bound: false,
  },
];

export function pick<T>(value: { fr: T; en: T }, locale: Locale): T {
  return value[locale];
}
