/**
 * Registration — how a person approaches Kima.
 *
 * The half of the product that was missing. Portal sign-in only authenticated
 * taxpayers the firm had already created, which meant there was no way in: the
 * system could serve clients but could not acquire one.
 *
 * TWO IDEAS CARRY THIS FILE.
 *
 * 1. EVERYTHING THE APPLICANT TYPES IS A CLAIM. The fields are named
 *    `declared_*` for that reason. An application is not a client, a reported
 *    NIU is not a verified NIU, and nothing here promotes a claim to a fact —
 *    only a reviewer does, against the taxpayer's official profile. The
 *    database agrees: an approval with no taxpayer file, or a rejection with no
 *    reason, is refused by a CHECK constraint rather than by our good
 *    intentions.
 *
 * 2. THE CHANNEL DECIDES WHAT MAY BE ASSUMED. Someone who walked into an office
 *    has been seen in person and handed over paper. Someone who typed into a
 *    form has not been seen at all. The same status means different things
 *    depending on how it arrived, so the channel travels with the record
 *    instead of being lost at the door.
 *
 * WHAT IS DELIBERATELY NOT ASKED AT THE FRONT DOOR: the tax regime and the tax
 * centre. They are the two fields that drive obligations and deadlines, and
 * they are precisely what a visitor cannot answer reliably. A wrong answer
 * there poisons everything downstream, so they are left to the reviewer. The
 * columns exist for applicants who volunteer them, and even then they stay
 * `declared_`.
 *
 * Pure functions over plain records: a transition or a score can be explained
 * without running the application.
 */

import type { TaxpayerType } from "./rules";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type RegistrationStatus =
  | "submitted"
  | "verifying"
  | "needs_info"
  | "approved"
  | "rejected"
  | "withdrawn";

/**
 * How the application reached us.
 *
 * All paths are weighted equally in the interface. The assisted ones are not a
 * fallback for people who failed at the real one — in a market where most
 * connectivity is mobile and much of the paperwork is paper, they are the
 * normal way in for a large share of clients.
 */
export type IntakeChannel = "online" | "whatsapp" | "agency" | "referral";

export type Registration = {
  id: string;
  applicant_name: string;
  applicant_email: string | null;
  applicant_phone: string | null;
  taxpayer_type: TaxpayerType;
  legal_name: string | null;
  declared_niu: string | null;
  declared_regime: string | null;
  declared_centre: string | null;
  identity_document_ref: string | null;
  intake_channel: IntakeChannel;
  preferred_language: "fr" | "en";
  status: RegistrationStatus;
  submitted_at: string;
  first_response_at: string | null;
  decided_at: string | null;
  info_requests: number;
  activated_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  taxpayer_id: string | null;
};

/** What the public form actually collects. */
export type RegistrationDraft = {
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  taxpayer_type: TaxpayerType | "";
  legal_name: string;
  declared_niu: string;
  intake_channel: IntakeChannel;
  preferred_language: "fr" | "en";
};

export const EMPTY_DRAFT: RegistrationDraft = {
  applicant_name: "",
  applicant_email: "",
  applicant_phone: "",
  taxpayer_type: "",
  legal_name: "",
  declared_niu: "",
  intake_channel: "online",
  preferred_language: "fr",
};

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

/**
 * Allowed transitions, declared once.
 *
 * `approved` and `rejected` are terminal on purpose. Reopening a decision by
 * editing the row would overwrite the decision's timestamp and its author,
 * which are the two things a disputed decision turns on. A changed mind starts
 * a new application instead.
 */
const TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  submitted: ["verifying", "needs_info", "rejected", "withdrawn"],
  verifying: ["needs_info", "approved", "rejected", "withdrawn"],
  needs_info: ["verifying", "rejected", "withdrawn"],
  approved: [],
  rejected: [],
  withdrawn: [],
};

export const canTransition = (from: RegistrationStatus, to: RegistrationStatus): boolean =>
  TRANSITIONS[from]?.includes(to) ?? false;

export const nextStates = (from: RegistrationStatus): RegistrationStatus[] =>
  TRANSITIONS[from] ?? [];

export const isTerminal = (s: RegistrationStatus): boolean => TRANSITIONS[s].length === 0;

export type TransitionInput = {
  to: RegistrationStatus;
  by: string;
  note?: string;
  taxpayerId?: string;
  at?: string;
};

export type TransitionResult =
  | { ok: true; patch: Partial<Registration> }
  | { ok: false; reason: "not_allowed" | "reason_required" | "file_required" };

/**
 * The patch a transition produces, including the KPI timestamps.
 *
 * Those timestamps are set here rather than by a trigger or by each call site,
 * so "time to first response" means one thing everywhere. `first_response_at`
 * is stamped by the FIRST move off `submitted`, whatever that move is — the
 * applicant has heard from us either way, and a measure that counted only
 * approvals would flatter us.
 */
export function transition(
  current: Pick<Registration, "status" | "first_response_at" | "info_requests">,
  input: TransitionInput,
): TransitionResult {
  if (!canTransition(current.status, input.to)) return { ok: false, reason: "not_allowed" };

  // The database refuses these too. Catching them here means the practitioner
  // sees a sentence rather than a constraint violation.
  if (input.to === "rejected" && !input.note?.trim()) {
    return { ok: false, reason: "reason_required" };
  }
  if (input.to === "approved" && !input.taxpayerId) {
    return { ok: false, reason: "file_required" };
  }

  const at = input.at ?? new Date().toISOString();
  const patch: Partial<Registration> = { status: input.to };

  if (!current.first_response_at) patch.first_response_at = at;
  if (input.to === "needs_info") patch.info_requests = current.info_requests + 1;

  if (input.to === "approved" || input.to === "rejected") {
    patch.decided_at = at;
    patch.decided_by = input.by;
    if (input.note?.trim()) patch.decision_note = input.note.trim();
    if (input.taxpayerId) patch.taxpayer_id = input.taxpayerId;
  }

  return { ok: true, patch };
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * How complete an application is, proportionate to who is applying.
 *
 * ADVISORY ONLY. It orders the triage queue and tells the practitioner what to
 * ask for first. It is never a submit gate: a form that refuses an incomplete
 * application turns away exactly the clients this product exists to reach — the
 * ones with no NIU, no email address, and a bag of receipts. A name and a phone
 * number is a better outcome than a clean form nobody filled in.
 */
export type Completeness = {
  score: number;
  present: string[];
  missing: string[];
};

export function completeness(d: RegistrationDraft): Completeness {
  const present: string[] = [];
  const missing: string[] = [];
  const check = (key: string, ok: boolean) => (ok ? present : missing).push(key);

  check("applicant_name", d.applicant_name.trim().length > 1);
  // Either channel counts. Requiring an email would exclude the clients who
  // only use WhatsApp, which is a great many of them.
  check("contact", Boolean(d.applicant_phone.trim() || d.applicant_email.trim()));
  check("taxpayer_type", d.taxpayer_type !== "");

  // A business has a registered name; an individual does not.
  if (d.taxpayer_type.startsWith("business")) {
    check("legal_name", d.legal_name.trim().length > 1);
  }

  // The NIU is useful, never required. An applicant without one is often
  // exactly the person who needs help getting one.
  check("declared_niu", d.declared_niu.trim().length > 0);

  const total = present.length + missing.length;
  return {
    score: total === 0 ? 0 : Math.round((present.length / total) * 100),
    present,
    missing,
  };
}

/** The minimum to accept a submission at all: a name, a type, and one way to reply. */
export const canSubmit = (d: RegistrationDraft): boolean =>
  d.applicant_name.trim().length > 1 &&
  d.taxpayer_type !== "" &&
  Boolean(d.applicant_phone.trim() || d.applicant_email.trim());

// ---------------------------------------------------------------------------
// KPI helpers
// ---------------------------------------------------------------------------

const HOURS = 36e5;

export const hoursBetween = (from: string | null, to: string | null): number | null =>
  from && to ? (Date.parse(to) - Date.parse(from)) / HOURS : null;

/**
 * Is this application past the first-response target?
 *
 * Shown in the triage queue beside the row, not buried in a monthly report. A
 * target nobody sees while working is a target nobody meets.
 */
export function breachesFirstResponse(
  r: Pick<Registration, "submitted_at" | "first_response_at">,
  targetHours = 24,
  now = new Date().toISOString(),
): boolean {
  if (r.first_response_at) return false;
  return (hoursBetween(r.submitted_at, now) ?? 0) > targetHours;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const INTAKE_CHANNELS: {
  key: IntakeChannel;
  fr: string;
  en: string;
  helpFr: string;
  helpEn: string;
}[] = [
  {
    key: "online",
    fr: "En ligne, maintenant",
    en: "Online, right now",
    helpFr: "Vous remplissez ce formulaire et nous vous répondons.",
    helpEn: "You fill in this form and we reply.",
  },
  {
    key: "whatsapp",
    fr: "Par WhatsApp",
    en: "By WhatsApp",
    helpFr: "Nous vous guidons par message, à votre rythme.",
    helpEn: "We guide you by message, at your own pace.",
  },
  {
    key: "agency",
    fr: "En agence",
    en: "At our office",
    helpFr: "Apportez vos documents papier : nous nous occupons du reste.",
    helpEn: "Bring your paper records: we handle the rest.",
  },
  {
    key: "referral",
    fr: "Recommandé par quelqu'un",
    en: "Referred by someone",
    helpFr: "Indiquez qui vous a orienté vers nous.",
    helpEn: "Tell us who pointed you to us.",
  },
];

export const channelLabel = (c: IntakeChannel, locale: "fr" | "en") => {
  const f = INTAKE_CHANNELS.find((x) => x.key === c);
  return f ? (locale === "fr" ? f.fr : f.en) : c;
};

export const STATUS_LABELS: Record<RegistrationStatus, { fr: string; en: string }> = {
  submitted: { fr: "Nouvelle", en: "New" },
  verifying: { fr: "Vérification", en: "Verifying" },
  needs_info: { fr: "Info demandée", en: "Info requested" },
  approved: { fr: "Acceptée", en: "Approved" },
  rejected: { fr: "Refusée", en: "Declined" },
  withdrawn: { fr: "Retirée", en: "Withdrawn" },
};

export const statusLabel = (s: RegistrationStatus, locale: "fr" | "en") =>
  locale === "fr" ? STATUS_LABELS[s].fr : STATUS_LABELS[s].en;

/** Normalised the way the sign-in identifier is, so the two can be compared. */
export const normaliseNiu = (raw: string): string =>
  raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
