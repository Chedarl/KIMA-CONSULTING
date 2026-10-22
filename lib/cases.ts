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
 * `documents` reads as "waiting on you" ONLY when a blocker is actually
 * recorded. A case sitting in documents because the firm has not started is
 * not the client's fault and must not be shown as though it were — that is how
 * a portal quietly blames the customer for the firm's own backlog.
 */
export function clientStatus(c: Pick<ComplianceCase, "stage" | "blocker">): ClientStatus {
  switch (c.stage) {
    case "documents":
      return c.blocker ? "waiting_on_you" : "in_progress";
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
  at?: string;
};

export type AdvanceResult =
  | { ok: true; patch: Partial<ComplianceCase> }
  | {
      ok: false;
      reason: "not_allowed" | "blocked_by_findings" | "owner_required" | "filing_not_verified";
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
  current: Pick<ComplianceCase, "stage" | "owner">,
  input: AdvanceInput,
): AdvanceResult {
  if (!canAdvance(current.stage, input.to)) return { ok: false, reason: "not_allowed" };

  if (current.stage === "review" && input.to === "filing") {
    if (hasBlocking(input.findings ?? [])) return { ok: false, reason: "blocked_by_findings" };
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

  if (!current.owner) patch.owner = input.by.trim();
  // Moving a case asserts that the previous blocker is gone. Carrying it
  // forward silently is how a queue fills with stale reasons.
  patch.blocker = input.blocker?.trim() || null;

  if (isClosed(input.to)) patch.closed_at = at;

  return { ok: true, patch };
}

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
    "stage" | "blocker" | "filing_status" | "payment_evidence_status" | "billing_status"
  >,
  locale: "fr" | "en",
) {
  return {
    work: stageLabel(c.stage, locale),
    filing: filingLabel(c.filing_status, locale),
    payment: paymentLabel(c.payment_evidence_status, locale),
    billing: billingLabel(c.billing_status, locale),
    clientFacing: clientStatusLabel(clientStatus(c), locale),
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

/**
 * The case's blocker, derived from its open blocking tasks.
 *
 * Derived rather than typed, so the queue's one-line reason cannot drift from
 * the task list it claims to summarise — the same mistake as a typed regime
 * tag beside a verified one. The earliest-due blocking task wins, because that
 * is the one actually holding things up.
 */
export function deriveBlocker(tasks: CaseTask[]): string | null {
  const blocking = tasks
    .filter((t) => t.state === "open" && t.is_blocking)
    .sort((a, b) => (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31"));
  return blocking[0]?.title ?? null;
}

/** Open cases with nobody's name on them. Work nobody owns does not happen. */
export const unowned = <T extends Pick<ComplianceCase, "owner" | "stage" | "closed_at">>(
  cases: T[],
): T[] => cases.filter((c) => !c.closed_at && !isClosed(c.stage) && !c.owner);
