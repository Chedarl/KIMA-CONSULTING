/**
 * The activity log — one change, recorded once, read by everyone.
 *
 * The failure this exists to prevent is specific and familiar: a document reads
 * "accepted" in the client portal and "awaiting review" in the firm inbox,
 * because each surface kept its own idea of what happened. So no surface is
 * allowed its own history. A change produces an event here, and the portal, the
 * inbox and the case timeline all render that same row.
 *
 * THE LOG DOES NOT HOLD THE TRUTH — the case row does. The log holds what
 * happened to it. Keeping both is how `drift()` can exist at all: if the row
 * says `verified` and the log never recorded a verification, something wrote
 * around the engine, and that is worth knowing before a client is told.
 *
 * VISIBILITY IS DERIVED, NEVER PASSED. Whether an event may appear in the
 * client portal is a property of the KIND of event, not a decision at the call
 * site — because the call site is where someone in a hurry publishes an
 * internal review verdict by accident. The same whitelist exists as a CHECK
 * constraint on `case_events`, so a direct SQL write cannot leak either.
 *
 * APPEND-ONLY. No function here updates or deletes. Neither can the client
 * keys: UPDATE, DELETE and TRUNCATE are revoked. A history that can be edited
 * is not a history.
 *
 * Pure functions, so what the client will be shown can be checked without
 * running the application.
 */

import {
  advance,
  awaitingClient,
  billingLabel,
  clientStatus,
  clientStatusLabel,
  filingLabel,
  paymentLabel,
  recordFiling,
  stageLabel,
  type AdvanceInput,
  type AdvanceResult,
  type BillingStatus,
  type CaseStage,
  type ClientStatus,
  type ComplianceCase,
  type FilingStatus,
  type PaymentEvidenceStatus,
  type RecordFilingInput,
  type RequestStatus,
} from "./cases";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type EventDimension =
  | "work"
  | "filing"
  | "payment"
  | "billing"
  | "document"
  | "request"
  | "engagement"
  | "note";

/**
 * Who acted. `system` is the only actor allowed to be anonymous — everything
 * else carries a name, because a change nobody is named for cannot be audited.
 *
 * These are the blueprint's user categories. Permissions themselves are the
 * next feature and will reuse this enum rather than inventing a second one.
 */
export type ActorRole =
  | "client"
  | "firm_staff"
  | "firm_reviewer"
  | "firm_partner"
  | "kima_admin"
  | "system";

export type Visibility = "internal" | "client";

export type EventKind =
  // work
  | "case_opened"
  | "stage_advanced"
  | "stage_returned"
  | "advance_refused"
  | "owner_assigned"
  | "client_status_changed"
  | "case_closed"
  | "case_abandoned"
  | "self_approval_disclosed"
  // what the administration acknowledged
  | "filing_attempted"
  | "filing_awaiting_verification"
  | "filing_verified"
  | "filing_correction_required"
  | "filing_reset"
  // payment of the TAX
  | "payment_evidence_requested"
  | "payment_evidence_received"
  | "payment_verified"
  // KIMA's own fee
  | "quotation_sent"
  | "quotation_accepted"
  | "invoice_issued"
  | "fee_paid"
  | "fee_outstanding"
  // documents and requests
  | "document_uploaded"
  | "document_accepted"
  | "document_rejected"
  | "request_created"
  | "request_attached"
  | "request_submitted"
  | "request_returned"
  | "request_accepted"
  // authority
  | "engagement_authorized"
  | "engagement_accepted"
  | "engagement_revoked"
  // a human sentence with no state change behind it
  | "note_added";

/**
 * Which case column an event reports on, if any.
 *
 * This field is the reason `latestValue()` can be trusted. Without it, a
 * `client_status_changed` event — dimension `work`, like a stage change, but
 * carrying a client status in `to_value` — would be read as the case's stage
 * and quietly corrupt every drift check.
 */
export type Tracks =
  | "stage"
  | "client_status"
  | "filing_status"
  | "payment_evidence_status"
  | "billing_status"
  | null;

type KindSpec = {
  dimension: EventDimension;
  /** Derived into `visibility`. Mirrored by a CHECK constraint in SQL. */
  clientVisible: boolean;
  tracks: Tracks;
  fr: (e: CaseEvent) => string;
  en: (e: CaseEvent) => string;
};

/** The stored code rendered as words, in one place, so no surface invents its own. */
function word(value: string | null, tracks: Tracks, locale: "fr" | "en"): string {
  if (!value) return "—";
  switch (tracks) {
    case "stage":
      return stageLabel(value as CaseStage, locale);
    case "client_status":
      return clientStatusLabel(value as ClientStatus, locale);
    case "filing_status":
      return filingLabel(value as FilingStatus, locale);
    case "payment_evidence_status":
      return paymentLabel(value as PaymentEvidenceStatus, locale);
    case "billing_status":
      return billingLabel(value as BillingStatus, locale);
    default:
      return value;
  }
}

const toWord = (e: CaseEvent, locale: "fr" | "en") =>
  word(e.to_value, EVENT_KINDS[e.kind].tracks, locale);
const fromWord = (e: CaseEvent, locale: "fr" | "en") =>
  word(e.from_value, EVENT_KINDS[e.kind].tracks, locale);
const subject = (e: CaseEvent) => e.subject_ref ?? "—";

/**
 * Every kind, once: its dimension, whether the client may see it, what it
 * reports on, and the single sentence that describes it in both languages.
 *
 * The sentences live here rather than in a component because the portal and the
 * inbox must say the same thing. Two templates for one event is how a client is
 * told something the firm did not say.
 */
export const EVENT_KINDS: Record<EventKind, KindSpec> = {
  case_opened: {
    dimension: "work",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Dossier ouvert : ${e.to_value}`,
    en: (e) => `Case opened: ${e.to_value}`,
  },
  stage_advanced: {
    dimension: "work",
    clientVisible: false,
    tracks: "stage",
    fr: (e) => `Étape : ${fromWord(e, "fr")} → ${toWord(e, "fr")}`,
    en: (e) => `Stage: ${fromWord(e, "en")} → ${toWord(e, "en")}`,
  },
  stage_returned: {
    dimension: "work",
    clientVisible: false,
    tracks: "stage",
    fr: (e) => `Renvoyé en ${toWord(e, "fr")} depuis ${fromWord(e, "fr")}`,
    en: (e) => `Sent back to ${toWord(e, "en")} from ${fromWord(e, "en")}`,
  },
  advance_refused: {
    dimension: "work",
    clientVisible: false,
    tracks: null,
    fr: (e) =>
      `Avancement refusé depuis ${fromWord(e, "fr")} : ${e.reason ?? "motif non enregistré"}`,
    en: (e) => `Advance refused from ${fromWord(e, "en")}: ${e.reason ?? "no reason recorded"}`,
  },
  owner_assigned: {
    dimension: "work",
    clientVisible: false,
    tracks: null,
    fr: (e) => `Confié à ${e.to_value}`,
    en: (e) => `Assigned to ${e.to_value}`,
  },
  client_status_changed: {
    dimension: "work",
    clientVisible: true,
    tracks: "client_status",
    fr: (e) => toWord(e, "fr"),
    en: (e) => toWord(e, "en"),
  },
  case_closed: {
    dimension: "work",
    clientVisible: true,
    tracks: "stage",
    fr: () => "Dossier livré et clos",
    en: () => "Case delivered and closed",
  },
  case_abandoned: {
    dimension: "work",
    clientVisible: true,
    tracks: "stage",
    fr: (e) => `Dossier abandonné : ${e.reason ?? "motif non enregistré"}`,
    en: (e) => `Case abandoned: ${e.reason ?? "no reason recorded"}`,
  },
  // Client-visible on purpose. If the same person prepared and approved the
  // work, the person whose return it is has the clearest interest in knowing.
  self_approval_disclosed: {
    dimension: "work",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Préparé et validé par la même personne : ${e.to_value}`,
    en: (e) => `Prepared and approved by the same person: ${e.to_value}`,
  },

  filing_attempted: {
    dimension: "filing",
    clientVisible: true,
    tracks: "filing_status",
    fr: () => "Dépôt tenté — issue encore inconnue",
    en: () => "Submission attempted — outcome not yet known",
  },
  filing_awaiting_verification: {
    dimension: "filing",
    clientVisible: false,
    tracks: "filing_status",
    fr: () => "Dépôt transmis, en attente de vérification",
    en: () => "Submission sent, awaiting verification",
  },
  filing_verified: {
    dimension: "filing",
    clientVisible: true,
    tracks: "filing_status",
    fr: (e) => `Dépôt vérifié — preuve ${subject(e)}`,
    en: (e) => `Filing verified — evidence ${subject(e)}`,
  },
  filing_correction_required: {
    dimension: "filing",
    clientVisible: true,
    tracks: "filing_status",
    fr: (e) => `Correction requise : ${e.reason ?? "motif non enregistré"}`,
    en: (e) => `Correction required: ${e.reason ?? "no reason recorded"}`,
  },
  filing_reset: {
    dimension: "filing",
    clientVisible: false,
    tracks: "filing_status",
    fr: (e) => `Dépôt ramené à « non déposé » : ${e.reason ?? "motif non enregistré"}`,
    en: (e) => `Filing reset to not submitted: ${e.reason ?? "no reason recorded"}`,
  },

  payment_evidence_requested: {
    dimension: "payment",
    clientVisible: true,
    tracks: "payment_evidence_status",
    fr: () => "Preuve de paiement de l'impôt demandée",
    en: () => "Evidence of tax payment requested",
  },
  payment_evidence_received: {
    dimension: "payment",
    clientVisible: false,
    tracks: "payment_evidence_status",
    fr: () => "Preuve de paiement reçue, non encore vérifiée",
    en: () => "Payment evidence received, not yet verified",
  },
  payment_verified: {
    dimension: "payment",
    clientVisible: true,
    tracks: "payment_evidence_status",
    fr: () => "Paiement de l'impôt vérifié",
    en: () => "Tax payment verified",
  },

  quotation_sent: {
    dimension: "billing",
    clientVisible: false,
    tracks: "billing_status",
    fr: () => "Devis envoyé",
    en: () => "Quotation sent",
  },
  quotation_accepted: {
    dimension: "billing",
    clientVisible: false,
    tracks: "billing_status",
    fr: () => "Devis accepté",
    en: () => "Quotation accepted",
  },
  invoice_issued: {
    dimension: "billing",
    clientVisible: false,
    tracks: "billing_status",
    fr: () => "Facture émise",
    en: () => "Invoice issued",
  },
  fee_paid: {
    dimension: "billing",
    clientVisible: false,
    tracks: "billing_status",
    fr: () => "Honoraires réglés",
    en: () => "Fee paid",
  },
  fee_outstanding: {
    dimension: "billing",
    clientVisible: false,
    tracks: "billing_status",
    fr: () => "Honoraires impayés",
    en: () => "Fee outstanding",
  },

  document_uploaded: {
    dimension: "document",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Pièce déposée : ${subject(e)}`,
    en: (e) => `Document uploaded: ${subject(e)}`,
  },
  document_accepted: {
    dimension: "document",
    clientVisible: false,
    tracks: null,
    fr: (e) => `Pièce acceptée en comptabilité : ${subject(e)}`,
    en: (e) => `Document accepted into the accounts: ${subject(e)}`,
  },
  // Internal on purpose. The client is told through `request_returned`, which
  // carries a reason written for them; a raw review verdict is not that.
  document_rejected: {
    dimension: "document",
    clientVisible: false,
    tracks: null,
    fr: (e) => `Pièce refusée : ${subject(e)} — ${e.reason ?? "motif non enregistré"}`,
    en: (e) => `Document rejected: ${subject(e)} — ${e.reason ?? "no reason recorded"}`,
  },

  request_created: {
    dimension: "request",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Pièce demandée : ${subject(e)}`,
    en: (e) => `Document requested: ${subject(e)}`,
  },
  request_attached: {
    dimension: "request",
    clientVisible: false,
    tracks: null,
    fr: (e) => `Demande rattachée au dossier : ${subject(e)}`,
    en: (e) => `Request attached to this case: ${subject(e)}`,
  },
  request_submitted: {
    dimension: "request",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Pièce reçue : ${subject(e)}`,
    en: (e) => `Document received: ${subject(e)}`,
  },
  request_returned: {
    dimension: "request",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Pièce à reprendre : ${subject(e)} — ${e.reason ?? "motif non enregistré"}`,
    en: (e) => `Document needs redoing: ${subject(e)} — ${e.reason ?? "no reason recorded"}`,
  },
  request_accepted: {
    dimension: "request",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Pièce acceptée : ${subject(e)}`,
    en: (e) => `Document accepted: ${subject(e)}`,
  },

  engagement_authorized: {
    dimension: "engagement",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Mission autorisée : ${subject(e)}`,
    en: (e) => `Engagement authorised: ${subject(e)}`,
  },
  engagement_accepted: {
    dimension: "engagement",
    clientVisible: true,
    tracks: null,
    fr: (e) => `Mission acceptée par le client : ${subject(e)}`,
    en: (e) => `Engagement accepted by the client: ${subject(e)}`,
  },
  engagement_revoked: {
    dimension: "engagement",
    clientVisible: true,
    tracks: null,
    fr: (e) =>
      `Mission révoquée : ${subject(e)}${e.reason ? ` — ${e.reason}` : ""}`,
    en: (e) =>
      `Engagement revoked: ${subject(e)}${e.reason ? ` — ${e.reason}` : ""}`,
  },

  note_added: {
    dimension: "note",
    clientVisible: true,
    tracks: null,
    fr: (e) => e.reason ?? "Note",
    en: (e) => e.reason ?? "Note",
  },
};

/**
 * The only producer of `visibility`.
 *
 * Derived from the kind, so publishing an internal event to the portal is not a
 * mistake a call site can make. The SQL CHECK constraint says the same thing.
 */
export const visibilityOf = (kind: EventKind): Visibility =>
  EVENT_KINDS[kind].clientVisible ? "client" : "internal";

export const dimensionOf = (kind: EventKind): EventDimension => EVENT_KINDS[kind].dimension;

/**
 * What a client session may write to the log: their own acts, as themselves.
 * Everything else — a stage move, a verified filing, a fee paid — is the
 * firm's to record. The database enforces the same list
 * (`client_may_record()`, migration 20261027120000); the engine check fails if
 * the two drift.
 */
export const CLIENT_EVENT_KINDS = [
  "document_uploaded",
  "request_submitted",
  "engagement_authorized",
  "engagement_accepted",
  "engagement_revoked",
  "note_added",
] as const satisfies readonly EventKind[];

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type Actor = { role: ActorRole; label: string | null };

export type CaseEvent = {
  id: string;
  case_id: string;
  occurred_at: string;
  dimension: EventDimension;
  kind: EventKind;
  actor_role: ActorRole;
  actor_label: string | null;
  from_value: string | null;
  to_value: string | null;
  subject_ref: string | null;
  reason: string | null;
  visibility: Visibility;
};

/** What we insert. The database supplies the id. */
export type NewCaseEvent = Omit<CaseEvent, "id">;

type EventDraft = {
  kind: EventKind;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  reason?: string | null;
};

/**
 * Build one event. Dimension and visibility come from the kind; the caller
 * supplies only the facts.
 *
 * An actor other than `system` must be named. The database enforces this too,
 * so the engine refusing early is a convenience, not the guarantee.
 */
export function buildEvent(
  caseId: string,
  actor: Actor,
  draft: EventDraft,
  at?: string,
): NewCaseEvent {
  const label = actor.label?.trim() || null;
  if (actor.role !== "system" && !label) {
    throw new Error(`event ${draft.kind} needs a named actor: ${actor.role} has no label`);
  }
  return {
    case_id: caseId,
    occurred_at: at ?? new Date().toISOString(),
    dimension: dimensionOf(draft.kind),
    kind: draft.kind,
    actor_role: actor.role,
    actor_label: label,
    from_value: draft.from ?? null,
    to_value: draft.to ?? null,
    subject_ref: draft.subject ?? null,
    reason: draft.reason ?? null,
    visibility: visibilityOf(draft.kind),
  };
}

// ---------------------------------------------------------------------------
// Turning engine decisions into events
// ---------------------------------------------------------------------------

/**
 * Forward or backward, for naming the event honestly.
 *
 * Work in this trade goes backwards often — a failed review returns to
 * preparation — and a log that calls every move "advanced" hides exactly the
 * thing a practitioner needs to see when a case is stuck in a loop.
 */
const STAGE_ORDER: CaseStage[] = [
  "documents",
  "accounting",
  "preparation",
  "review",
  "filing",
  "evidence",
  "delivered",
];

const isBackwards = (fromStage: CaseStage, toStage: CaseStage) => {
  const a = STAGE_ORDER.indexOf(fromStage);
  const b = STAGE_ORDER.indexOf(toStage);
  return a >= 0 && b >= 0 && b < a;
};

/**
 * The events a stage move produces — including when it is refused.
 *
 * A REFUSAL IS RECORDED. Not every refusal: only the ones where somebody tried
 * to push work out of the building and a gate stopped them. That attempt is the
 * auditable fact — "nothing happened" is not what happened, and a review gate
 * nobody can see being hit is a gate nobody trusts.
 *
 * `client_status_changed` is emitted only when the client-visible status
 * actually changes. Three internal stages map to "work in progress", and a
 * portal announcing each of them is noise dressed as transparency.
 *
 * The decision is taken by `advance()` itself rather than re-derived here, so
 * the log cannot record a move the engine refused, or miss one it allowed.
 */
export function eventsFromAdvance(
  before: Pick<ComplianceCase, "id" | "stage" | "owner" | "blocker" | "prepared_by" | "filing_status">,
  input: AdvanceInput,
  actor: Actor,
): NewCaseEvent[] {
  const result: AdvanceResult = advance(before, input);
  const at = input.at;
  const e = (draft: EventDraft) => buildEvent(before.id, actor, draft, at);

  if (!result.ok) {
    // The gates that protect the outside world, and one that protects the
    // integrity of the review: somebody tried to pass their own work and the
    // control stopped them. That attempt is exactly what an auditor asks about.
    // `approval_not_checked` and `documents_not_checked` are absent on purpose:
    // they are programming slips, not business refusals, and logging them would
    // put a developer's mistake in a client's file.
    const audited =
      result.reason === "blocked_by_findings" ||
      result.reason === "filing_not_verified" ||
      result.reason === "documents_outstanding" ||
      result.reason === "self_approval_refused";
    return audited
      ? [e({ kind: "advance_refused", from: before.stage, reason: result.reason })]
      : [];
  }

  const out: NewCaseEvent[] = [];
  const next = input.to;

  if (next === "abandoned") {
    out.push(
      e({ kind: "case_abandoned", from: before.stage, to: next, reason: input.blocker ?? null }),
    );
  } else if (next === "delivered") {
    out.push(e({ kind: "case_closed", from: before.stage, to: next }));
  } else {
    out.push(
      e({
        kind: isBackwards(before.stage, next) ? "stage_returned" : "stage_advanced",
        from: before.stage,
        to: next,
        reason: input.blocker ?? null,
      }),
    );
  }

  if (!before.owner && result.patch.owner) {
    out.push(e({ kind: "owner_assigned", to: result.patch.owner }));
  }

  // A disclosed self-approval is a fact about how the work was checked, so it
  // belongs in the history the client can read -- not buried in a column.
  if (result.patch.self_approved) {
    out.push(e({ kind: "self_approval_disclosed", to: actor.label ?? "—" }));
  }

  // The requests do not change during a stage move, so only the stage differs
  // between the two readings. Derived from the same input the gate used, so the
  // log cannot claim a client-facing change the engine did not make.
  const owed = awaitingClient(input.requests ?? []);
  const wasShown = clientStatus(before, owed);
  const nowShown = clientStatus({ ...before, stage: next }, owed);
  if (wasShown !== nowShown) {
    out.push(e({ kind: "client_status_changed", from: wasShown, to: nowShown }));
  }

  return out;
}

const FILING_EVENT: Record<FilingStatus, EventKind> = {
  not_submitted: "filing_reset",
  attempted: "filing_attempted",
  awaiting_verification: "filing_awaiting_verification",
  verified: "filing_verified",
  correction_required: "filing_correction_required",
};

/** The events a filing move produces. A refused move produces none. */
export function eventsFromFiling(
  before: Pick<ComplianceCase, "id" | "filing_status">,
  input: RecordFilingInput & { reason?: string | null },
  actor: Actor,
): NewCaseEvent[] {
  const result = recordFiling(before, input);
  if (!result.ok) return [];
  return [
    buildEvent(
      before.id,
      actor,
      {
        kind: FILING_EVENT[input.to],
        from: before.filing_status,
        to: input.to,
        subject: input.evidenceRef ?? input.reference ?? null,
        reason: input.reason ?? null,
      },
      input.at,
    ),
  ];
}

const REQUEST_EVENT: Partial<Record<RequestStatus, EventKind>> = {
  requested: "request_created",
  submitted: "request_submitted",
  returned: "request_returned",
  accepted: "request_accepted",
};

/**
 * The event a request's move produces, when it is one the case should record.
 *
 * `in_progress` and `in_client_review` are deliberately silent: they are the
 * firm's and the client's own working states, and logging them would fill a
 * case history with motion rather than events.
 */
export function eventFromRequest(
  caseId: string,
  move: { from: RequestStatus | null; to: RequestStatus; label: string; reason?: string | null },
  actor: Actor,
  at?: string,
): NewCaseEvent | null {
  const kind = REQUEST_EVENT[move.to];
  if (!kind) return null;
  return buildEvent(
    caseId,
    actor,
    { kind, from: move.from, to: move.to, subject: move.label, reason: move.reason ?? null },
    at,
  );
}

/**
 * A note. The one place an audience is chosen rather than derived — because a
 * note's audience is its content: a message written for the client and an
 * internal remark are different things, not the same thing shown twice.
 */
export function noteEvent(
  caseId: string,
  actor: Actor,
  text: string,
  audience: Visibility,
  at?: string,
): NewCaseEvent {
  const body = text.trim();
  if (!body) throw new Error("a note with no text is not an event");
  const built = buildEvent(caseId, actor, { kind: "note_added", to: audience, reason: body }, at);
  return { ...built, visibility: audience };
}

// ---------------------------------------------------------------------------
// Reading the log
// ---------------------------------------------------------------------------

export type Audience = "firm" | "client";

/**
 * The history, newest first, filtered for who is looking.
 *
 * The client filter is the whole point of `visibility`, and it is applied here
 * rather than in a query so it can be tested without a database.
 */
export function timeline(events: CaseEvent[], audience: Audience): CaseEvent[] {
  const visible = audience === "client" ? events.filter((x) => x.visibility === "client") : events;
  return [...visible].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/** One sentence per event, from the one template that both surfaces use. */
export const describe = (e: CaseEvent, locale: "fr" | "en") =>
  locale === "fr" ? EVENT_KINDS[e.kind].fr(e) : EVENT_KINDS[e.kind].en(e);

/**
 * What the log says a dimension's current value is.
 *
 * Only events that actually report on that column are considered — see
 * `Tracks`. Returns null when the log has nothing to say, which is different
 * from the value being unknown: a case opened before the log existed has no
 * entries and is not therefore in a bad state.
 *
 * CALLER CONTRACT: pass events ordered by `(occurred_at, created_at)`, which is
 * what `order by occurred_at, created_at` gives you. The sort below is stable
 * and `occurred_at` alone is not a total order — two events written in the same
 * millisecond would otherwise resolve by whatever order the query happened to
 * return, and `drift()` would report a contradiction that depends on luck.
 */
export function latestValue(events: CaseEvent[], tracks: Exclude<Tracks, null>): string | null {
  const relevant = events
    .filter((x) => EVENT_KINDS[x.kind].tracks === tracks && x.to_value)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return relevant.length ? relevant[relevant.length - 1].to_value : null;
}

export type Drift = {
  tracks: Exclude<Tracks, null>;
  row: string;
  log: string;
};

type TrackedColumn =
  | "stage"
  | "filing_status"
  | "payment_evidence_status"
  | "billing_status";

const TRACKED: { tracks: Exclude<Tracks, null>; column: TrackedColumn }[] = [
  { tracks: "stage", column: "stage" },
  { tracks: "filing_status", column: "filing_status" },
  { tracks: "payment_evidence_status", column: "payment_evidence_status" },
  { tracks: "billing_status", column: "billing_status" },
];

/**
 * Where the case row and its own history disagree.
 *
 * This is the check that makes the whole design falsifiable. If a row says
 * `verified` and no verification was ever logged, something wrote around the
 * engine — and that is worth catching before a client is told their declaration
 * was accepted on the strength of it.
 *
 * A dimension the log is silent about is NOT drift. Silence means nobody
 * recorded anything, which is a gap in coverage, not a contradiction.
 */
export function drift(
  c: Pick<ComplianceCase, "stage" | "filing_status" | "payment_evidence_status" | "billing_status">,
  events: CaseEvent[],
): Drift[] {
  const out: Drift[] = [];
  for (const { tracks, column } of TRACKED) {
    const logged = latestValue(events, tracks);
    if (!logged) continue;
    const row = String(c[column]);
    if (row !== logged) out.push({ tracks, row, log: logged });
  }
  return out;
}

/**
 * The client-facing history, as sentences.
 *
 * What the portal renders. Kept here so the question "what have we told this
 * client?" has one answer that can be inspected in a test.
 */
export const clientTimeline = (events: CaseEvent[], locale: "fr" | "en") =>
  timeline(events, "client").map((e) => ({
    at: e.occurred_at,
    text: describe(e, locale),
    by: e.actor_role === "client" ? null : e.actor_label,
  }));

/** Every kind the client may ever see. Useful for asserting the SQL whitelist. */
export const clientVisibleKinds = (): EventKind[] =>
  (Object.keys(EVENT_KINDS) as EventKind[]).filter((k) => EVENT_KINDS[k].clientVisible);
