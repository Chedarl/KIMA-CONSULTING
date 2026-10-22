/**
 * Compliance cases — the spine of the firm workspace.
 *
 * A case is ONE obligation for ONE taxpayer in ONE period: "VAT for September
 * 2026 for Mboa Trading". Everything the firm does hangs off that unit — the
 * documents it needs, the review it must pass, the evidence it must keep.
 *
 * CASES ARE GENERATED, NOT CONFIGURED. They come from `obligationsFor()` and
 * `resolveDueDate()`, which come from the rule registry. This is the inverse of
 * the reference product, whose pipelines are templates somebody must remember
 * to apply, and whose own users name the configuration burden as the main
 * obstacle. A solo practitioner with ten clients has no operations team to
 * build workflows, and should not need one.
 *
 * THE UNCERTAINTY TRAVELS WITH THE CASE. Most of our rule corpus is `inferred`
 * rather than `verified`, so generating cases could mint confident-looking
 * deadlines out of evidence nobody has checked. A generated case carries
 * `due_needs_confirmation` from the resolver, and the queue renders those dates
 * as provisional. The case inherits the doubt instead of laundering it.
 *
 * TWO VOCABULARIES, KEPT APART. The firm's internal stage is detailed; the
 * client-visible status is a small fixed set. Which draft failed review and who
 * it went back to is not the client's business, and a portal that leaks it
 * invites arguments about work in progress rather than about outcomes.
 *
 * Pure functions, so a stage, a date or a refusal can be explained without
 * running the application.
 */

import {
  OBLIGATIONS,
  obligationsFor,
  resolveDueDate,
  type Obligation,
  type Prorogation,
  type Regime,
  type TaxpayerType,
} from "./rules";
import { periodToken, type Period } from "./document-naming";
import { hasBlocking, type Finding } from "./diagnostics";
// Type-only, and deliberately so: `lib/permissions.ts` imports this module's
// types the same way, and a value import in either direction would make the
// two mutually dependent at runtime.
import type { ApprovalDecision } from "./permissions";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type CaseStage =
  | "documents"
  | "accounting"
  | "preparation"
  | "review"
  | "filing"
  | "evidence"
  | "delivered"
  | "abandoned";

/**
 * What the administration acknowledged — NOT what we did.
 *
 * `attempted` exists because the DGI's platforms go down. A submission tried
 * during an outage is neither "not submitted" nor "filed"; it is an attempt
 * whose outcome nobody knows, and the case has to be able to say so. Pretending
 * otherwise is the failure this whole product is built against.
 */
export type FilingStatus =
  | "not_submitted"
  | "attempted"
  | "awaiting_verification"
  | "verified"
  | "correction_required";

/** Whether the TAX was paid. Nothing to do with whether KIMA was paid. */
export type PaymentEvidenceStatus =
  | "not_applicable"
  | "unknown"
  | "requested"
  | "received"
  | "verified";

/** Whether KIMA's own fee was settled. Never a compliance state. */
export type BillingStatus =
  | "quotation_pending"
  | "accepted"
  | "invoiced"
  | "paid"
  | "outstanding";

/**
 * The authority the firm acts under.
 *
 * An engagement used to be a status and two timestamps — a record that somebody
 * said yes, but not what they said yes TO. Scope matters beyond tidiness: work
 * outside an engagement is work nobody agreed to, and a client asked to pay for
 * it has a fair complaint.
 */
export type Engagement = {
  id: string;
  taxpayer_id: string;
  status: string;
  service_code: string | null;
  scope_note: string | null;
  /** Integer XAF. Zero-decimal currency, never a float. */
  fee_xaf: number | null;
  assigned_to: string | null;
  authorized_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

/** The unit a person actually picks up. */
export type CaseTask = {
  id: string;
  case_id: string;
  title: string;
  detail: string | null;
  assigned_to: string | null;
  state: "open" | "done" | "cancelled";
  is_blocking: boolean;
  due_on: string | null;
  completed_at: string | null;
};

/**
 * The request lifecycle. `returned` is first-class: work comes back.
 *
 * Defined here, once. It previously existed three times -- in the seed data, in
 * the Supabase row types, and implicitly in two components' hard-coded arrays --
 * which is the same duplication that let display labels be stored where the
 * engine expected codes. One vocabulary, one place.
 */
export type RequestStatus =
  | "requested"
  | "in_progress"
  | "in_client_review"
  | "returned"
  | "submitted"
  | "accepted";

/**
 * A request for one document, serving one case.
 *
 * A request carries NO period of its own. It inherits the period from the case
 * it serves, which is why `case_id` matters beyond tidiness: an unattached
 * request is a document nobody can say which return it belongs to. The database
 * holds the same link as a composite foreign key on (case_id, taxpayer_id), so
 * a request cannot attach to another taxpayer's case even by direct SQL.
 */
export type CaseRequest = {
  id: string;
  case_id: string | null;
  taxpayer_id: string;
  label_fr: string;
  label_en: string;
  status: RequestStatus;
  responsible: "taxpayer" | "firm";
  due_on: string;
  returned_count: number;
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, { fr: string; en: string }> = {
  requested: { fr: "Demandée", en: "Requested" },
  in_progress: { fr: "En cours", en: "In progress" },
  in_client_review: { fr: "À valider", en: "In client review" },
  returned: { fr: "À reprendre", en: "Returned" },
  submitted: { fr: "Reçue", en: "Submitted" },
  accepted: { fr: "Acceptée", en: "Accepted" },
};

export const requestStatusLabel = (s: RequestStatus, locale: "fr" | "en") =>
  locale === "fr" ? REQUEST_STATUS_LABELS[s].fr : REQUEST_STATUS_LABELS[s].en;

/**
 * Open means the document is not yet settled.
 *
 * `submitted` counts as open on purpose: a document has arrived but nobody has
 * accepted it, and doing the accounts on unreviewed pieces is precisely the
 * mistake the three-verdict review exists to prevent.
 */
export const requestIsOpen = (s: RequestStatus): boolean => s !== "accepted";

/**
 * Still owed by somebody -- as distinct from merely unsettled.
 *
 * A `submitted` document has arrived and is waiting on US to review it. It is
 * open, but it is not outstanding, and a client count that conflates the two
 * tells a client they owe something they already sent. The two notions are
 * named apart because both are needed and neither is the other.
 */
export const requestIsOutstanding = (s: RequestStatus): boolean =>
  s !== "accepted" && s !== "submitted";

export const openRequests = <T extends Pick<CaseRequest, "status">>(requests: T[]): T[] =>
  requests.filter((r) => requestIsOpen(r.status));

/**
 * Whose court the ball is in for one request. Defined once, because two
 * consumers need it and they must not disagree: the derived blocker names the
 * single thing holding the case up, and `awaitingClient` asks whether ANYTHING
 * is owed by the client.
 *
 * Once a document has been submitted it is ours to review, whoever was asked
 * for it. Before that, whoever is responsible still owes it.
 */
export const waitsOn = (r: Pick<CaseRequest, "status" | "responsible">): "client" | "firm" =>
  r.status === "submitted" ? "firm" : r.responsible === "taxpayer" ? "client" : "firm";

/**
 * Is anything at all outstanding from the client?
 *
 * Distinct from the derived blocker on purpose. The blocker is the ONE earliest
 * item, and an internal task due sooner than a client's document would
 * otherwise hide the fact that the client owes something — which is exactly the
 * wrong thing for a portal to get wrong.
 */
export const awaitingClient = (
  requests: Pick<CaseRequest, "status" | "responsible">[],
): boolean => requests.some((r) => requestIsOpen(r.status) && waitsOn(r) === "client");

export type ComplianceCase = {
  id: string;
  taxpayer_id: string;
  /** The engagement authorising this work. Null means nobody authorised it. */
  engagement_id: string | null;
  obligation_code: string;
  period_token: string;
  due_on: string | null;
  due_needs_confirmation: boolean;
  due_basis: "statutory" | "prorogation";
  stage: CaseStage;
  owner: string | null;
  blocker: string | null;
  opened_at: string;
  closed_at: string | null;

  // The three dimensions the stage must never be allowed to swallow.
  filing_status: FilingStatus;
  filing_reference: string | null;
  filing_evidence_ref: string | null;
  filing_attempted_at: string | null;
  filing_verified_at: string | null;
  payment_evidence_status: PaymentEvidenceStatus;
  billing_status: BillingStatus;

  // Separation of duties. Stamped by `advance()` on entering and leaving
  // review, never typed by hand -- the whole value of this control is that
  // nobody chooses what it says.
  prepared_by: string | null;
  prepared_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  /** The same person prepared and approved, and said so. Never silent. */
  self_approved: boolean;
};

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/**
 * The real sequence, with the exceptions that actually happen.
 *
 * Work goes backwards more often than forward in this trade: a review that
 * fails returns to preparation, and a document that turns out to be missing
 * sends an accounting case back to collecting. A pipeline modelling only
 * forward motion cannot represent the most frustrating part of the job — the
 * lesson the request lifecycle already learned with its `returned` state.
 */
const STAGE_FLOW: Record<CaseStage, CaseStage[]> = {
  documents: ["accounting", "abandoned"],
  accounting: ["preparation", "documents", "abandoned"],
  preparation: ["review", "accounting", "documents", "abandoned"],
  review: ["filing", "preparation", "abandoned"],
  filing: ["evidence", "review", "abandoned"],
  evidence: ["delivered", "filing", "abandoned"],
  delivered: [],
  abandoned: [],
};

export const canAdvance = (from: CaseStage, to: CaseStage): boolean =>
  STAGE_FLOW[from]?.includes(to) ?? false;

export const nextStages = (from: CaseStage): CaseStage[] => STAGE_FLOW[from] ?? [];

export const isClosed = (s: CaseStage): boolean => s === "delivered" || s === "abandoned";

export const STAGE_LABELS: Record<CaseStage, { fr: string; en: string }> = {
  documents: { fr: "Pièces", en: "Documents" },
  accounting: { fr: "Comptabilité", en: "Accounting" },
  preparation: { fr: "Préparation", en: "Preparation" },
  review: { fr: "Revue", en: "Review" },
  filing: { fr: "Dépôt", en: "Filing" },
  evidence: { fr: "Preuve de dépôt", en: "Filing evidence" },
  delivered: { fr: "Livré", en: "Delivered" },
  abandoned: { fr: "Abandonné", en: "Abandoned" },
};

export const stageLabel = (s: CaseStage, locale: "fr" | "en") =>
  locale === "fr" ? STAGE_LABELS[s].fr : STAGE_LABELS[s].en;

// ---------------------------------------------------------------------------
// What the client sees
// ---------------------------------------------------------------------------

/**
 * Five states, and no more.
 *
 * The client needs to know whether the ball is in their court, whether we are
 * working, and whether it is finished. They do not need our stage names, and
 * showing them turns "why is it in preparation and not review?" into a
 * conversation nobody benefits from.
 */
export type ClientStatus =
  | "waiting_on_you"
  | "in_progress"
  | "in_review"
  | "filed_awaiting_proof"
  | "complete";

export const CLIENT_STATUS_LABELS: Record<ClientStatus, { fr: string; en: string }> = {
  waiting_on_you: { fr: "Nous attendons vos pièces", en: "We are waiting for your documents" },
  in_progress: { fr: "Travail en cours", en: "Work in progress" },
  in_review: { fr: "En cours de revue", en: "Under review" },
  filed_awaiting_proof: { fr: "Déposé — preuve en attente", en: "Filed — awaiting proof" },
  complete: { fr: "Terminé", en: "Complete" },
};

/**
 * The one place the internal stage is translated for the client.
 *
 * `documents` reads as "waiting on you" ONLY when something is actually
 * outstanding FROM THE CLIENT. A case sitting in documents because the firm
 * has not started is not the client's fault and must not be shown as though
 * it were — that is how a portal quietly blames the customer for the firm's
 * own backlog.
 *
 * THE SECOND ARGUMENT IS REQUIRED. It was briefly optional, falling back to the
 * free-text `blocker` column, and that was a trap: the correct reading was
 * opt-in, so every caller that forgot kept the old one with no warning. The
 * free-text column cannot say WHOSE court the ball is in, and guessing
 * "the client's" is the one direction where being wrong is rude.
 *
 * It takes `awaitingClient` rather than the derived blocker, because the
 * blocker is the single earliest item: a task due sooner than a client's
 * document would hide the fact that the client owes anything at all.
 *
 * The consequence is deliberate: a case blocked only by a hand-written note
 * reads as work in progress, not as waiting on the client. To tell a client
 * they owe something, raise a request — which is what requests are for.
 */
export function clientStatus(
  c: Pick<ComplianceCase, "stage">,
  awaitingClient: boolean,
): ClientStatus {
  switch (c.stage) {
    case "documents":
      return awaitingClient ? "waiting_on_you" : "in_progress";
    case "accounting":
    case "preparation":
      return "in_progress";
    case "review":
      return "in_review";
    case "filing":
    case "evidence":
      return "filed_awaiting_proof";
    case "delivered":
    case "abandoned":
      return "complete";
  }
}

export const clientStatusLabel = (s: ClientStatus, locale: "fr" | "en") =>
  locale === "fr" ? CLIENT_STATUS_LABELS[s].fr : CLIENT_STATUS_LABELS[s].en;

// ---------------------------------------------------------------------------
// Advancing a case
// ---------------------------------------------------------------------------

export type AdvanceInput = {
  to: CaseStage;
  by: string;
  blocker?: string | null;
  findings?: Finding[];
  /** The filing and payment dimensions, needed to gate delivery. */
  filing?: Pick<ComplianceCase, "filing_status" | "payment_evidence_status">;
  /**
   * The requests attached to this case.
   *
   * Required in practice for `documents -> accounting`, which refuses rather
   * than skips when it is missing. Whole rows, not just statuses, because the
   * event builder derives what the client is told from the same input.
   */
  requests?: CaseRequest[];
  /**
   * The outcome of `canApproveReview()`, required for `review -> filing`.
   *
   * A DECISION, not the facts to decide from. The separation-of-duties rule
   * lives in `lib/permissions.ts` and is stated once; this gate consumes its
   * verdict rather than re-deriving it, so the two cannot drift apart. And
   * because the gate refuses when it is absent, a caller cannot skip the
   * control by forgetting it.
   */
  approval?: ApprovalDecision;
  at?: string;
};

export type AdvanceResult =
  | { ok: true; patch: Partial<ComplianceCase> }
  | {
      ok: false;
      reason:
        | "not_allowed"
        | "blocked_by_findings"
        | "documents_outstanding"
        | "documents_not_checked"
        | "approval_not_checked"
        | "self_approval_refused"
        | "owner_required"
        | "filing_not_verified";
    };

/** The default when a caller supplies no filing information: assume nothing. */
const FILING_UNKNOWN = {
  filing_status: "not_submitted" as FilingStatus,
  payment_evidence_status: "unknown" as PaymentEvidenceStatus,
};

/**
 * Move a case, or refuse and say why.
 *
 * THE GATE: review → filing is refused while a blocking diagnostic is open.
 * That rule already exists in `lib/diagnostics.ts`, where it gates approval;
 * this is the same gate expressed as movement, so the two cannot disagree. It
 * is the one transition where being wrong is expensive — everything before it
 * is internal, and everything after it has left the building.
 */
export function advance(
  current: Pick<ComplianceCase, "stage" | "owner" | "prepared_by">,
  input: AdvanceInput,
): AdvanceResult {
  if (!canAdvance(current.stage, input.to)) return { ok: false, reason: "not_allowed" };

  if (current.stage === "review" && input.to === "filing") {
    if (hasBlocking(input.findings ?? [])) return { ok: false, reason: "blocked_by_findings" };

    // SEPARATION OF DUTIES. The oldest control in the trade: whoever prepared
    // the work should not be the one who passes it. Checked here because this
    // is already the one transition that decides whether work leaves the
    // building, and a second place deciding it is a second place to disagree.
    if (!input.approval) return { ok: false, reason: "approval_not_checked" };
    if (!input.approval.ok) return { ok: false, reason: "self_approval_refused" };
  }

  // THE SECOND GATE: the accounts are not started on documents nobody has
  // accepted. `submitted` is not `accepted`, and the difference is the whole
  // point of reviewing a piece before it reaches the ledger.
  //
  // ABSENT INFORMATION NEVER PERMITS A GATED MOVE — the same rule as delivery
  // below, and now the only rule. This gate used to skip itself when no
  // requests were supplied, on the argument that the move is internal and
  // reversible. That was true and still a mistake: a caller that simply forgot
  // the argument got no gate and no warning, which is the exact shape of the
  // delivery bug already fixed once. A refusal naming what is missing is loud,
  // and loud is what a developer needs.
  if (current.stage === "documents" && input.to === "accounting") {
    if (!input.requests) return { ok: false, reason: "documents_not_checked" };
    if (openRequests(input.requests).length > 0) {
      return { ok: false, reason: "documents_outstanding" };
    }
  }

  // Delivery asserts an outcome to the client, so it waits on the
  // administration rather than on us. Checked here and in the database, because
  // a rule that lives only in TypeScript is one SQL write from being untrue.
  // Absent filing information the move is refused rather than assumed: the
  // safe default for a claim about the state is "we do not know".
  if (input.to === "delivered" && !canDeliver(input.filing ?? FILING_UNKNOWN)) {
    return { ok: false, reason: "filing_not_verified" };
  }

  // Work that nobody owns is work that does not happen.
  if (input.to !== "abandoned" && !current.owner && !input.by.trim()) {
    return { ok: false, reason: "owner_required" };
  }

  const at = input.at ?? new Date().toISOString();
  const patch: Partial<ComplianceCase> = { stage: input.to };

  // Entering review records who prepared the work. Not overwritten if already
  // set: a case that goes round the review loop twice was still prepared by
  // whoever first put it up, and letting the second pass rewrite that would
  // quietly launder a self-approval.
  if (input.to === "review" && !current.prepared_by) {
    patch.prepared_by = input.by.trim();
    patch.prepared_at = at;
  }

  // Leaving review records who passed it, and whether that was the same
  // person. The database holds the same rule as a CHECK constraint, so a
  // direct write cannot record an undisclosed self-approval either.
  if (current.stage === "review" && input.to === "filing" && input.approval?.ok) {
    patch.approved_by = input.by.trim();
    patch.approved_at = at;
    patch.self_approved = input.approval.selfApproved;
  }

  if (!current.owner) patch.owner = input.by.trim();
  // Moving a case asserts that the previous blocker is gone. Carrying it
  // forward silently is how a queue fills with stale reasons.
  patch.blocker = input.blocker?.trim() || null;

  if (isClosed(input.to)) patch.closed_at = at;

  return { ok: true, patch };
}

/**
 * Why a move was refused, in words a practitioner can act on.
 *
 * Here rather than in a component because two surfaces already need them and
 * a refusal explained differently in two places is a refusal nobody trusts.
 * `*_not_checked` reads as a fault in the application, which is exactly what it
 * is: a caller that did not supply the facts the gate needs. Saying so is
 * better than inventing a business reason for a programming slip.
 */
export const ADVANCE_REFUSAL_LABELS: Record<
  Extract<AdvanceResult, { ok: false }>["reason"],
  { fr: string; en: string }
> = {
  not_allowed: {
    fr: "Ce mouvement n'existe pas depuis cette étape.",
    en: "That move does not exist from this stage.",
  },
  blocked_by_findings: {
    fr: "Un contrôle bloquant est ouvert : il doit être levé avant la revue.",
    en: "A blocking check is open: it has to be cleared before review passes.",
  },
  documents_outstanding: {
    fr: "Des pièces ne sont pas encore acceptées. Reçu ne veut pas dire accepté.",
    en: "Documents are not yet accepted. Received does not mean accepted.",
  },
  documents_not_checked: {
    fr: "Les pièces du dossier n'ont pas été consultées — anomalie technique.",
    en: "The case's documents were not read — an application fault.",
  },
  approval_not_checked: {
    fr: "Aucune décision de revue fournie — anomalie technique.",
    en: "No review decision supplied — an application fault.",
  },
  self_approval_refused: {
    fr: "Auto-validation refusée : une autre personne doit valider cette revue.",
    en: "Self-approval refused: somebody else has to pass this review.",
  },
  owner_required: {
    fr: "Ce dossier n'a pas de responsable.",
    en: "This case has nobody responsible for it.",
  },
  filing_not_verified: {
    fr: "Dépôt non vérifié : la livraison attend l'accusé de réception.",
    en: "Filing not verified: delivery waits on the acknowledgment.",
  },
};

export const advanceRefusalLabel = (
  reason: Extract<AdvanceResult, { ok: false }>["reason"],
  locale: "fr" | "en",
) => (locale === "fr" ? ADVANCE_REFUSAL_LABELS[reason].fr : ADVANCE_REFUSAL_LABELS[reason].en);

// ---------------------------------------------------------------------------
// The other three dimensions
// ---------------------------------------------------------------------------

/**
 * Filing moves on EVIDENCE, not on effort.
 *
 * `verified` is the only value that asserts something about the outside world,
 * so it is the only one that demands proof: a reference AND an evidence
 * document. The database enforces the same thing, because a rule that lives
 * only in TypeScript is one direct SQL write away from being untrue.
 *
 * An attempt can fail back to `not_submitted` — the DGI's platforms go down
 * mid-submission, and a case has to be able to record that nothing landed.
 */
const FILING_FLOW: Record<FilingStatus, FilingStatus[]> = {
  not_submitted: ["attempted"],
  attempted: ["awaiting_verification", "not_submitted"],
  awaiting_verification: ["verified", "correction_required", "attempted"],
  verified: ["correction_required"],
  correction_required: ["attempted"],
};

export type RecordFilingInput = {
  to: FilingStatus;
  reference?: string | null;
  evidenceRef?: string | null;
  at?: string;
};

export type FilingResult =
  | { ok: true; patch: Partial<ComplianceCase> }
  | { ok: false; reason: "not_allowed" | "evidence_required" };

export function recordFiling(
  current: Pick<ComplianceCase, "filing_status">,
  input: RecordFilingInput,
): FilingResult {
  if (!FILING_FLOW[current.filing_status]?.includes(input.to)) {
    return { ok: false, reason: "not_allowed" };
  }

  // The whole constraint, in one branch: a declaration is never "filed"
  // because somebody clicked a button.
  if (input.to === "verified" && !input.evidenceRef?.trim()) {
    return { ok: false, reason: "evidence_required" };
  }

  const at = input.at ?? new Date().toISOString();
  const patch: Partial<ComplianceCase> = { filing_status: input.to };

  if (input.reference?.trim()) patch.filing_reference = input.reference.trim();
  if (input.to === "attempted") patch.filing_attempted_at = at;
  if (input.to === "verified") {
    patch.filing_evidence_ref = input.evidenceRef!.trim();
    patch.filing_verified_at = at;
  }

  return { ok: true, patch };
}

/**
 * Can this case be delivered to the client?
 *
 * Delivering before the administration has acknowledged the filing hands over
 * a pack that implies an outcome nobody has confirmed. The exception is an
 * obligation with nothing to file, which is why `not_applicable` exists on the
 * payment dimension rather than being faked on the filing one.
 */
export function canDeliver(
  c: Pick<ComplianceCase, "filing_status" | "payment_evidence_status">,
): boolean {
  if (c.payment_evidence_status === "not_applicable") return true;
  return c.filing_status === "verified" || c.filing_status === "correction_required";
}

export const FILING_LABELS: Record<FilingStatus, { fr: string; en: string }> = {
  not_submitted: { fr: "Non déposée", en: "Not submitted" },
  attempted: { fr: "Dépôt tenté — issue inconnue", en: "Submission attempted — outcome unknown" },
  awaiting_verification: { fr: "En attente de vérification", en: "Awaiting verification" },
  verified: { fr: "Dépôt vérifié", en: "Filing verified" },
  correction_required: { fr: "Correction requise", en: "Correction required" },
};

export const PAYMENT_LABELS: Record<PaymentEvidenceStatus, { fr: string; en: string }> = {
  not_applicable: { fr: "Sans objet", en: "Not applicable" },
  unknown: { fr: "Inconnu", en: "Unknown" },
  requested: { fr: "Preuve demandée", en: "Evidence requested" },
  received: { fr: "Preuve reçue", en: "Evidence received" },
  verified: { fr: "Paiement vérifié", en: "Payment verified" },
};

export const BILLING_LABELS: Record<BillingStatus, { fr: string; en: string }> = {
  quotation_pending: { fr: "Devis en attente", en: "Quotation pending" },
  accepted: { fr: "Devis accepté", en: "Quotation accepted" },
  invoiced: { fr: "Facturé", en: "Invoiced" },
  paid: { fr: "Réglé", en: "Paid" },
  outstanding: { fr: "Impayé", en: "Outstanding" },
};

export const filingLabel = (s: FilingStatus, locale: "fr" | "en") =>
  locale === "fr" ? FILING_LABELS[s].fr : FILING_LABELS[s].en;
export const paymentLabel = (s: PaymentEvidenceStatus, locale: "fr" | "en") =>
  locale === "fr" ? PAYMENT_LABELS[s].fr : PAYMENT_LABELS[s].en;
export const billingLabel = (s: BillingStatus, locale: "fr" | "en") =>
  locale === "fr" ? BILLING_LABELS[s].fr : BILLING_LABELS[s].en;

/**
 * The four dimensions, for display, with the one rule that governs them.
 *
 * Billing is excluded from anything the client reads as compliance. Whether
 * KIMA has been paid is a commercial matter between us and them; showing it
 * beside "filing verified" invites the reading that an unpaid invoice makes
 * someone non-compliant, which is false and would be an ugly thing to imply.
 */
export function statusSummary(
  c: Pick<
    ComplianceCase,
    "stage" | "filing_status" | "payment_evidence_status" | "billing_status"
  >,
  awaitsClient: boolean,
  locale: "fr" | "en",
) {
  return {
    work: stageLabel(c.stage, locale),
    filing: filingLabel(c.filing_status, locale),
    payment: paymentLabel(c.payment_evidence_status, locale),
    billing: billingLabel(c.billing_status, locale),
    clientFacing: clientStatusLabel(clientStatus(c, awaitsClient), locale),
  };
}

// ---------------------------------------------------------------------------
// Generating cases from the rules
// ---------------------------------------------------------------------------

export type ProposedCase = {
  obligation_code: string;
  period_token: string;
  due_on: string;
  due_needs_confirmation: boolean;
  due_basis: "statutory" | "prorogation";
  /** Why this case exists, in the practitioner's language. */
  reasonFr: string;
  reasonEn: string;
};

const periodsForCadence = (o: Obligation, year: number): Period[] => {
  if (o.cadence === "monthly") {
    return Array.from({ length: 12 }, (_, i) => ({ kind: "month" as const, year, month: i + 1 }));
  }
  if (o.cadence === "quarterly") {
    return [1, 2, 3, 4].map((quarter) => ({ kind: "quarter" as const, year, quarter }));
  }
  return [{ kind: "year" as const, year }];
};

/**
 * The cases a taxpayer's year implies.
 *
 * PROPOSED, never silently inserted. A human opens them. The rule corpus is
 * mostly unverified, and a system that quietly created a year of deadlines from
 * inferred rules would be asserting far more than it knows.
 */
export function proposeCases(input: {
  type: TaxpayerType;
  regime: Regime | null;
  year: number;
  prorogations?: Prorogation[];
}): ProposedCase[] {
  const out: ProposedCase[] = [];

  for (const o of obligationsFor({ type: input.type, regime: input.regime })) {
    for (const period of periodsForCadence(o, input.year)) {
      const resolved = resolveDueDate(
        o,
        {
          year: input.year,
          month: period.kind === "month" ? period.month : undefined,
          quarter: period.kind === "quarter" ? period.quarter : undefined,
        },
        input.prorogations ?? [],
      );

      // A cadence that cannot place this period yields no date. Inventing one
      // would be worse than omitting the case.
      if (!resolved.date) continue;

      out.push({
        obligation_code: o.code,
        period_token: periodToken(period),
        due_on: resolved.date,
        due_needs_confirmation: resolved.needsConfirmation,
        due_basis: resolved.basis,
        reasonFr: `${o.fr} — ${resolved.reasonFr}`,
        reasonEn: `${o.en} — ${resolved.reasonEn}`,
      });
    }
  }

  return out.sort((a, b) => a.due_on.localeCompare(b.due_on));
}

export const obligationLabel = (code: string, locale: "fr" | "en") => {
  const o = OBLIGATIONS.find((x) => x.code === code);
  return o ? (locale === "fr" ? o.fr : o.en) : code;
};

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export type Risk = "overdue" | "due_soon" | "on_track" | "unknown";

/**
 * How worried to be about a case.
 *
 * `unknown` is a real answer, not a gap: a case whose due date rests on an
 * unverified rule has no reliable deadline, and colouring it green or red would
 * be inventing confidence we do not have. An overdue date still counts as
 * overdue even when unconfirmed — if the date is wrong it is likely wrong in
 * both directions, and the cheaper error is to look.
 */
export function risk(
  c: Pick<ComplianceCase, "due_on" | "due_needs_confirmation" | "stage" | "closed_at">,
  today = new Date().toISOString().slice(0, 10),
  soonDays = 7,
): Risk {
  if (c.closed_at || isClosed(c.stage)) return "on_track";
  if (!c.due_on) return "unknown";
  if (c.due_on < today) return "overdue";
  if (c.due_needs_confirmation) return "unknown";
  const days = Math.round(
    (Date.parse(`${c.due_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  return days <= soonDays ? "due_soon" : "on_track";
}

/**
 * The queue order: what a practitioner should look at first.
 *
 * Overdue, then imminent, then everything whose date we cannot vouch for —
 * because an unconfirmed deadline is a task in itself, not something to let
 * drift to the bottom of a list.
 */
const RISK_ORDER: Record<Risk, number> = { overdue: 0, due_soon: 1, unknown: 2, on_track: 3 };

export function queueOrder<T extends Parameters<typeof risk>[0]>(cases: T[], today?: string): T[] {
  return [...cases].sort((a, b) => {
    const ra = RISK_ORDER[risk(a, today)];
    const rb = RISK_ORDER[risk(b, today)];
    if (ra !== rb) return ra - rb;
    return (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31");
  });
}

// ---------------------------------------------------------------------------
// Authority and blockers
// ---------------------------------------------------------------------------

export type AuthorityProblem =
  | "no_engagement"
  | "engagement_revoked"
  | "engagement_not_authorized"
  | "out_of_scope";

/**
 * May the firm work this case at all?
 *
 * Checked separately from the stage flow, because "can this move forward" and
 * "were we ever allowed to touch it" are different questions with different
 * answers. A revoked engagement does not make the work invalid retroactively —
 * it makes continuing it unauthorised, which is why this reports rather than
 * mutating anything.
 *
 * Returns null when the work is properly authorised.
 */
export function authorityCheck(
  c: Pick<ComplianceCase, "engagement_id" | "obligation_code">,
  engagement: Engagement | null | undefined,
): AuthorityProblem | null {
  if (!c.engagement_id || !engagement) return "no_engagement";
  if (engagement.revoked_at) return "engagement_revoked";
  if (!engagement.authorized_at) return "engagement_not_authorized";
  // Scope is only enforced where it was actually stated. An engagement with no
  // service recorded is incomplete, not a licence to refuse all work — that
  // gap is surfaced by `no_engagement`-adjacent review, not by blocking here.
  if (engagement.service_code && engagement.service_code !== c.obligation_code) {
    return "out_of_scope";
  }
  return null;
}

export const AUTHORITY_LABELS: Record<AuthorityProblem, { fr: string; en: string }> = {
  no_engagement: {
    fr: "Aucune lettre de mission : travail non autorisé.",
    en: "No engagement on record: this work is unauthorised.",
  },
  engagement_revoked: {
    fr: "Mission révoquée : ne pas poursuivre sans nouvelle autorisation.",
    en: "Engagement revoked: do not continue without fresh authorisation.",
  },
  engagement_not_authorized: {
    fr: "Mission non encore autorisée par le client.",
    en: "Engagement not yet authorised by the client.",
  },
  out_of_scope: {
    fr: "Hors du périmètre de la mission acceptée.",
    en: "Outside the scope of the accepted engagement.",
  },
};

export const authorityLabel = (p: AuthorityProblem, locale: "fr" | "en") =>
  locale === "fr" ? AUTHORITY_LABELS[p].fr : AUTHORITY_LABELS[p].en;

export type BlockerSource = "task" | "request";

export type DerivedBlocker = {
  source: BlockerSource;
  /**
   * Whose court the ball is in.
   *
   * Load-bearing, not decorative: `clientStatus` reads it to decide whether to
   * tell a client we are waiting for them. A document they have already sent
   * still blocks the case -- but it blocks it on US, and saying otherwise in a
   * portal is both wrong and insulting.
   */
  waiting_on: "client" | "firm";
  due_on: string | null;
  fr: string;
  en: string;
};

/**
 * The case's blocker, derived from its open blocking work.
 *
 * Derived rather than typed, so the queue's one-line reason cannot drift from
 * the list it claims to summarise -- the same mistake as a typed regime tag
 * beside a verified one. The earliest-due item wins across BOTH tasks and
 * outstanding requests, because a practitioner does not care which table a
 * blocker lives in; they care what is holding the case up.
 *
 * Bilingual, because a request's label is bilingual and a blocker rendered in
 * one language is a blocker half the users cannot read. A task's title is
 * whatever the person typed, so it is reported unchanged in both.
 */
export function deriveBlocker(input: {
  tasks?: CaseTask[];
  requests?: CaseRequest[];
}): DerivedBlocker | null {
  const candidates: DerivedBlocker[] = [];

  for (const t of input.tasks ?? []) {
    if (t.state === "open" && t.is_blocking) {
      // Tasks are the firm's own work. A task assigned to a client is not a
      // thing this model has -- that is what a request is for.
      candidates.push({
        source: "task",
        waiting_on: "firm",
        due_on: t.due_on,
        fr: t.title,
        en: t.title,
      });
    }
  }

  for (const r of input.requests ?? []) {
    if (!requestIsOpen(r.status)) continue;
    // A returned document is named as such: the client has already sent
    // something, and being told "we are waiting for X" with no mention that it
    // came back is how a portal reads as indifferent.
    const back = r.status === "returned";
    candidates.push({
      source: "request",
      waiting_on: waitsOn(r),
      due_on: r.due_on,
      fr: back ? "À reprendre : " + r.label_fr : r.label_fr,
      en: back ? "Needs redoing: " + r.label_en : r.label_en,
    });
  }

  candidates.sort((a, b) => (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31"));
  return candidates[0] ?? null;
}

/**
 * What to show as the case's blocker, in one place.
 *
 * The derived blocker wins over the `blocker` column because a derived value
 * cannot go stale, while a hand-written note survives long after the thing it
 * described was resolved. The column remains the fallback for what is not yet
 * modelled as a task -- it is a note, not a second source of truth.
 */
export function effectiveBlocker(
  c: Pick<ComplianceCase, "blocker">,
  work: { tasks?: CaseTask[]; requests?: CaseRequest[] },
  locale: "fr" | "en",
): string | null {
  const derived = deriveBlocker(work);
  if (derived) return locale === "fr" ? derived.fr : derived.en;
  return c.blocker?.trim() || null;
}

export type AttachProblem = "wrong_taxpayer" | "case_closed" | "already_attached";

/**
 * Attach a request to the case it serves.
 *
 * The taxpayer check duplicates the composite foreign key on purpose: the
 * database makes a cross-taxpayer attachment impossible, and this makes it
 * explicable. A caller gets a named reason instead of a constraint violation.
 *
 * Re-attaching a request that already belongs to another case is refused rather
 * than silently moved, because a document that quietly changes which period it
 * supports is how a return ends up filed against evidence for a different one.
 */
export function attachRequest(
  c: Pick<ComplianceCase, "id" | "taxpayer_id" | "stage" | "closed_at">,
  r: Pick<CaseRequest, "id" | "case_id" | "taxpayer_id">,
): { ok: true; patch: { case_id: string } } | { ok: false; reason: AttachProblem } {
  if (r.taxpayer_id !== c.taxpayer_id) return { ok: false, reason: "wrong_taxpayer" };
  if (c.closed_at || isClosed(c.stage)) return { ok: false, reason: "case_closed" };
  if (r.case_id && r.case_id !== c.id) return { ok: false, reason: "already_attached" };
  return { ok: true, patch: { case_id: c.id } };
}

/** Open cases with nobody's name on them. Work nobody owns does not happen. */
export const unowned = <T extends Pick<ComplianceCase, "owner" | "stage" | "closed_at">>(
  cases: T[],
): T[] => cases.filter((c) => !c.closed_at && !isClosed(c.stage) && !c.owner);
