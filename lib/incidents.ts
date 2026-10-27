/**
 * Incident recovery — the state machine for "debited but not recognised".
 *
 * PROTOTYPE ENGINE (Agent B, 27 Oct 2026). Pure: no I/O, no clock unless the
 * caller omits `at`. It runs on mock data only (`lib/mocks/incidents.ts`) until
 * Agent A's schema for incidents and tax-payment states is merged (gate 5).
 * The contract it mirrors is in
 * `docs/strategy/2026-10-27-taxpayer-first/agent-b/state-machine.md`.
 *
 * Three rules this module exists to hold, each enforced in one place:
 *
 * 1. A taxpayer's act is recorded as DECLARED ("you reported"), never as fact.
 * 2. Only a reviewer — a person with a recorded professional credential (owner
 *    answer 1, backlog P1-8) — moves a payment to `verified` or an incident to
 *    `resolved`, and only by citing evidence of an official kind.
 * 3. A debit is not a payment. `debit_observed` has no edge to `verified`, and a
 *    wallet SMS or bank statement is never accepted as verifying evidence.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Whether the TAX was paid, as far as the evidence shows.
 *
 * This is the union proposed for Agent A's schema (backlog P1-1). It replaces,
 * for incident cases, the existing `PaymentEvidenceStatus` in `lib/cases.ts`
 * (`requested` / `received`), which cannot tell a debit from a receipt.
 */
export type PaymentState =
  | "not_applicable"
  | "unknown"
  | "attempted"
  | "debit_observed"
  | "reference_recorded"
  | "verified"
  | "disputed";

export const PAYMENT_STATES: PaymentState[] = [
  "not_applicable",
  "unknown",
  "attempted",
  "debit_observed",
  "reference_recorded",
  "verified",
  "disputed",
];

export type IncidentStatus =
  | "open"
  | "escalated"
  | "awaiting_administration"
  | "resolved"
  | "closed_unresolved";

export const INCIDENT_STATUSES: IncidentStatus[] = [
  "open",
  "escalated",
  "awaiting_administration",
  "resolved",
  "closed_unresolved",
];

export type IncidentType =
  | "portal_unavailable"
  | "payment_step_error"
  | "debit_not_recognised"
  | "certificate_blocked"
  | "other";

/** The certificate (ACF) dimension. KIMA never issues or imitates one. */
export type CertificateStatus = "not_requested" | "requested" | "blocked" | "obtained" | "expired";

export type ReviewerCredential = { body: string; number: string };

export type Actor =
  | { role: "taxpayer"; label: string }
  | { role: "reviewer"; label: string; credential: ReviewerCredential | null };

/**
 * What a piece of evidence is. Only the `official` kinds can support a
 * verification; everything a wallet or a phone produces is the taxpayer's own
 * record of what they saw.
 */
export type EvidenceKind =
  | "debit_sms"
  | "wallet_screenshot"
  | "bank_statement"
  | "portal_screenshot"
  | "official_receipt"
  | "administration_response"
  | "other";

export const OFFICIAL_EVIDENCE: EvidenceKind[] = ["official_receipt", "administration_response"];

export const isOfficialEvidence = (k: EvidenceKind): boolean => OFFICIAL_EVIDENCE.includes(k);

export type Evidence = {
  id: string;
  kind: EvidenceKind;
  /** File name or description. Synthetic in every fixture. */
  label: string;
  /** ISO 8601 with offset; displayed in Africa/Douala. */
  capturedAt: string;
  addedBy: Actor["role"];
};

export type ContactChannel = "phone" | "in_person" | "email" | "online_form" | "other";

/** One row of the escalation log. Append-only. */
export type Contact = {
  id: string;
  at: string;
  channel: ContactChannel;
  /** Who was contacted, as the taxpayer described it. Never a number KIMA supplies. */
  counterparty: string;
  /** Ticket or file number given by the administration, masked. */
  ticketMasked: string | null;
  response: string | null;
  /** What is still open after this contact. */
  unresolved: string | null;
  recordedBy: Actor["role"];
};

/**
 * How an act is shown. `declared` = the taxpayer said so. `recorded` = a
 * reviewer recorded a workflow step that proves nothing. `verified` = a
 * reviewer checked official evidence.
 */
export type Basis = "declared" | "recorded" | "verified";

export type IncidentEventKind =
  | "incident_reported"
  | "payment_changed"
  | "reference_recorded"
  | "incident_status_changed"
  | "evidence_added"
  | "contact_logged";

export type IncidentEvent = {
  at: string;
  kind: IncidentEventKind;
  actorRole: Actor["role"];
  actorLabel: string;
  basis: Basis;
  from: string | null;
  to: string | null;
  /** Evidence cited by this act, by id. */
  evidenceIds: string[];
  note: string | null;
};

export type Resolution = {
  outcome: "payment_confirmed" | "certificate_issued" | "withdrawn" | "no_answer" | "other";
  reason: string;
};

export type Incident = {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  detectedAt: string;
  /** Key into `HARMONY_PORTALS` in `lib/rules.ts`, or null. */
  portalKey: string | null;
  attemptedStep: string | null;
  /** What the screen said, in the taxpayer's words. Declared. */
  reportedError: string | null;
  payment: PaymentState;
  /** Last four characters only. The full value is never held by the UI. */
  referenceMasked: string | null;
  evidence: Evidence[];
  contacts: Contact[];
  resolution: Resolution | null;
  /** Who verified, when — only ever set by a reviewer act. */
  verifiedBy: string | null;
  verifiedAt: string | null;
  events: IncidentEvent[];
};

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * The payment graph. There is deliberately no `debit_observed → verified`
 * edge: a debit alone never reaches verified. A reference must be recorded
 * first, and then official evidence cited.
 */
export const PAYMENT_FLOW: Record<PaymentState, PaymentState[]> = {
  not_applicable: ["unknown"],
  unknown: ["attempted", "debit_observed", "not_applicable"],
  attempted: ["debit_observed", "reference_recorded", "unknown"],
  debit_observed: ["reference_recorded", "disputed"],
  reference_recorded: ["verified", "disputed"],
  disputed: ["verified", "reference_recorded"],
  verified: [],
};

/** States a taxpayer may declare. Everything else needs a reviewer. */
export const TAXPAYER_PAYMENT_TARGETS: PaymentState[] = [
  "attempted",
  "debit_observed",
  "reference_recorded",
];

export const INCIDENT_FLOW: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["escalated", "awaiting_administration", "resolved", "closed_unresolved"],
  escalated: ["awaiting_administration", "resolved", "closed_unresolved"],
  awaiting_administration: ["escalated", "resolved", "closed_unresolved"],
  resolved: [],
  closed_unresolved: ["open"],
};

/** Incident moves a taxpayer may make: escalate, say they are waiting, reopen. */
export const TAXPAYER_INCIDENT_TARGETS: IncidentStatus[] = [
  "escalated",
  "awaiting_administration",
  "open",
];

export type Refusal =
  | "not_allowed"
  | "reviewer_required"
  | "reviewer_not_credentialed"
  | "evidence_required"
  | "official_evidence_required"
  | "payment_not_verified"
  | "reason_required"
  | "closed";

export type Result = { ok: true; incident: Incident } | { ok: false; reason: Refusal };

const now = () => new Date().toISOString();

const basisFor = (actor: Actor, verifying: boolean): Basis =>
  actor.role === "taxpayer" ? "declared" : verifying ? "verified" : "recorded";

const isTerminal = (s: IncidentStatus) => s === "resolved";

function reviewerGate(actor: Actor): Refusal | null {
  if (actor.role !== "reviewer") return "reviewer_required";
  if (!actor.credential?.number.trim() || !actor.credential.body.trim()) {
    return "reviewer_not_credentialed";
  }
  return null;
}

/** The cited ids must all exist on the incident and at least one be official. */
function officialEvidenceGate(incident: Incident, ids: string[] | undefined): Refusal | null {
  const cited = (ids ?? []).map((id) => incident.evidence.find((e) => e.id === id));
  if (cited.length === 0 || cited.some((e) => !e)) return "evidence_required";
  if (!cited.some((e) => e && isOfficialEvidence(e.kind))) return "official_evidence_required";
  return null;
}

function append(incident: Incident, patch: Partial<Incident>, event: IncidentEvent): Incident {
  return { ...incident, ...patch, events: [...incident.events, event] };
}

// ---------------------------------------------------------------------------
// Acts
// ---------------------------------------------------------------------------

export type PaymentInput = {
  to: PaymentState;
  actor: Actor;
  evidenceIds?: string[];
  note?: string;
  at?: string;
};

/**
 * Move the tax-payment dimension. The single place where "paid" can be said.
 */
export function recordPayment(incident: Incident, input: PaymentInput): Result {
  if (isTerminal(incident.status)) return { ok: false, reason: "closed" };
  if (!PAYMENT_FLOW[incident.payment].includes(input.to)) return { ok: false, reason: "not_allowed" };

  if (input.actor.role === "taxpayer" && !TAXPAYER_PAYMENT_TARGETS.includes(input.to)) {
    return { ok: false, reason: "reviewer_required" };
  }

  const verifying = input.to === "verified";
  if (input.actor.role === "reviewer" || verifying) {
    const gate = reviewerGate(input.actor);
    if (gate) return { ok: false, reason: gate };
  }
  if (verifying) {
    const gate = officialEvidenceGate(incident, input.evidenceIds);
    if (gate) return { ok: false, reason: gate };
  }

  const at = input.at ?? now();
  const patch: Partial<Incident> = { payment: input.to };
  if (verifying) {
    patch.verifiedBy = input.actor.label;
    patch.verifiedAt = at;
  }
  return {
    ok: true,
    incident: append(incident, patch, {
      at,
      kind: "payment_changed",
      actorRole: input.actor.role,
      actorLabel: input.actor.label,
      basis: basisFor(input.actor, verifying),
      from: incident.payment,
      to: input.to,
      evidenceIds: input.evidenceIds ?? [],
      note: input.note?.trim() || null,
    }),
  };
}

/**
 * Mask a transaction reference to its last four characters. The prototype never
 * keeps the full value; in production the server would store a sha256 of it for
 * later matching (handoff to Agent A).
 */
export function maskReference(raw: string): string | null {
  const clean = raw.replace(/\s+/g, "");
  if (clean.length < 4) return null;
  return `•••• ${clean.slice(-4)}`;
}

export type ReferenceInput = { reference: string; actor: Actor; at?: string };

/** Record the transaction reference; moves payment to `reference_recorded` when the graph allows. */
export function recordReference(incident: Incident, input: ReferenceInput): Result {
  if (isTerminal(incident.status)) return { ok: false, reason: "closed" };
  const masked = maskReference(input.reference);
  if (!masked) return { ok: false, reason: "evidence_required" };
  const at = input.at ?? now();
  const event: IncidentEvent = {
    at,
    kind: "reference_recorded",
    actorRole: input.actor.role,
    actorLabel: input.actor.label,
    basis: basisFor(input.actor, false),
    from: null,
    to: masked,
    evidenceIds: [],
    note: null,
  };
  const withRef = append(incident, { referenceMasked: masked }, event);
  if (PAYMENT_FLOW[incident.payment].includes("reference_recorded")) {
    return recordPayment(withRef, { to: "reference_recorded", actor: input.actor, at });
  }
  return { ok: true, incident: withRef };
}

export type EvidenceInput = { evidence: Omit<Evidence, "addedBy">; actor: Actor; at?: string };

export function addEvidence(incident: Incident, input: EvidenceInput): Result {
  if (isTerminal(incident.status)) return { ok: false, reason: "closed" };
  if (incident.evidence.some((e) => e.id === input.evidence.id)) return { ok: false, reason: "not_allowed" };
  const evidence: Evidence = { ...input.evidence, addedBy: input.actor.role };
  return {
    ok: true,
    incident: append(
      incident,
      { evidence: [...incident.evidence, evidence] },
      {
        at: input.at ?? now(),
        kind: "evidence_added",
        actorRole: input.actor.role,
        actorLabel: input.actor.label,
        basis: basisFor(input.actor, false),
        from: null,
        to: evidence.kind,
        evidenceIds: [evidence.id],
        note: evidence.label,
      },
    ),
  };
}

export type ContactInput = { contact: Omit<Contact, "recordedBy">; actor: Actor };

/** Append to the escalation log. A first contact moves an `open` incident to `awaiting_administration`. */
export function logContact(incident: Incident, input: ContactInput): Result {
  if (isTerminal(incident.status)) return { ok: false, reason: "closed" };
  const contact: Contact = { ...input.contact, recordedBy: input.actor.role };
  const logged = append(
    incident,
    { contacts: [...incident.contacts, contact] },
    {
      at: contact.at,
      kind: "contact_logged",
      actorRole: input.actor.role,
      actorLabel: input.actor.label,
      basis: basisFor(input.actor, false),
      from: null,
      to: contact.channel,
      evidenceIds: [],
      note: contact.response,
    },
  );
  if (incident.status === "open") {
    return setIncidentStatus(logged, { to: "awaiting_administration", actor: input.actor, at: contact.at });
  }
  return { ok: true, incident: logged };
}

export type StatusInput = {
  to: IncidentStatus;
  actor: Actor;
  evidenceIds?: string[];
  resolution?: Resolution;
  at?: string;
};

/**
 * Move the incident. `resolved` needs a credentialed reviewer, official
 * evidence and a stated outcome; a `debit_not_recognised` incident also needs
 * the payment verified first. `closed_unresolved` needs a reviewer and a reason.
 */
export function setIncidentStatus(incident: Incident, input: StatusInput): Result {
  if (!INCIDENT_FLOW[incident.status].includes(input.to)) return { ok: false, reason: "not_allowed" };

  if (input.actor.role === "taxpayer" && !TAXPAYER_INCIDENT_TARGETS.includes(input.to)) {
    return { ok: false, reason: "reviewer_required" };
  }

  const resolving = input.to === "resolved";
  if (resolving || input.to === "closed_unresolved") {
    const gate = reviewerGate(input.actor);
    if (gate) return { ok: false, reason: gate };
    if (!input.resolution?.reason.trim()) return { ok: false, reason: "reason_required" };
  }
  if (resolving) {
    const gate = officialEvidenceGate(incident, input.evidenceIds);
    if (gate) return { ok: false, reason: gate };
    if (incident.type === "debit_not_recognised" && incident.payment !== "verified") {
      return { ok: false, reason: "payment_not_verified" };
    }
  }

  const at = input.at ?? now();
  const patch: Partial<Incident> = { status: input.to };
  if (input.to === "resolved" || input.to === "closed_unresolved") patch.resolution = input.resolution ?? null;
  if (input.to === "open") patch.resolution = null;

  return {
    ok: true,
    incident: append(incident, patch, {
      at,
      kind: "incident_status_changed",
      actorRole: input.actor.role,
      actorLabel: input.actor.label,
      basis: basisFor(input.actor, resolving),
      from: incident.status,
      to: input.to,
      evidenceIds: input.evidenceIds ?? [],
      note: input.resolution?.reason ?? null,
    }),
  };
}

// ---------------------------------------------------------------------------
// What the screen may offer
// ---------------------------------------------------------------------------

/**
 * Payment targets to offer this actor. The taxpayer view builds its controls
 * from this list, so a "verify" control cannot appear for a taxpayer.
 */
export function offeredPaymentTargets(incident: Incident, actor: Actor): PaymentState[] {
  if (isTerminal(incident.status)) return [];
  const next = PAYMENT_FLOW[incident.payment];
  return actor.role === "taxpayer" ? next.filter((s) => TAXPAYER_PAYMENT_TARGETS.includes(s)) : next;
}

export function offeredIncidentTargets(incident: Incident, actor: Actor): IncidentStatus[] {
  const next = INCIDENT_FLOW[incident.status];
  return actor.role === "taxpayer" ? next.filter((s) => TAXPAYER_INCIDENT_TARGETS.includes(s)) : next;
}

/** Shown when a payment is in a state the taxpayer must not take for "paid". */
export const isUnresolvedDebit = (p: PaymentState): boolean =>
  p === "debit_observed" || p === "reference_recorded" || p === "disputed";

/** "What is still unresolved?" — the question the comprehension test asks (metric 5). */
export function unresolvedItems(incident: Incident): ("payment" | "incident")[] {
  const out: ("payment" | "incident")[] = [];
  if (isUnresolvedDebit(incident.payment) || incident.payment === "attempted") out.push("payment");
  if (incident.status !== "resolved") out.push("incident");
  return out;
}
