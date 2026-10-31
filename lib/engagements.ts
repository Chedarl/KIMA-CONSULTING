/**
 * Writing an engagement — the other half of `authorityCheck`.
 *
 * The check already decides whether work is authorised, from `authorized_at`
 * and `revoked_at`, not from the free-text status. These functions set those
 * columns, and the status word, together. A row whose status says "authorized"
 * while `authorized_at` is empty is not authorised; the posture below says so.
 *
 * Client acceptance (`accepted_at`) is a fact about the client. Nothing here
 * writes it. The firm authorises or revokes.
 */

import type { Engagement } from "./cases";

export type EngagementPosture = "awaiting_authorisation" | "authorised" | "revoked";

/** What the timestamps say. The status string is not consulted. */
export function engagementPosture(
  e: Pick<Engagement, "authorized_at" | "revoked_at">,
): EngagementPosture {
  if (e.revoked_at) return "revoked";
  if (e.authorized_at) return "authorised";
  return "awaiting_authorisation";
}

export const POSTURE_LABELS: Record<EngagementPosture, { fr: string; en: string }> = {
  awaiting_authorisation: { fr: "En attente d'autorisation", en: "Awaiting authorisation" },
  authorised: { fr: "Autorisée", en: "Authorised" },
  revoked: { fr: "Révoquée", en: "Revoked" },
};

export const postureLabel = (p: EngagementPosture, locale: "fr" | "en") =>
  locale === "fr" ? POSTURE_LABELS[p].fr : POSTURE_LABELS[p].en;

export type EngagementRefusal = "already_authorised" | "already_revoked" | "reason_required" | "taxpayer_required" | "fee_invalid";

const subjectOf = (e: Pick<Engagement, "scope_note" | "service_code">) =>
  e.scope_note?.trim() || e.service_code?.trim() || "—";

export type EngagementEvent = {
  kind: "engagement_authorized" | "engagement_revoked";
  /** Stored in `to_value`. The event check refuses a row that omits it. */
  to: "authorized" | "revoked";
  subject: string;
  reason: string | null;
};

export function authorizeEngagement(
  current: Pick<Engagement, "authorized_at" | "revoked_at" | "scope_note" | "service_code">,
  at = new Date().toISOString(),
):
  | { ok: true; patch: { authorized_at: string; status: "authorized" }; event: EngagementEvent }
  | { ok: false; reason: "already_authorised" | "already_revoked" } {
  if (current.revoked_at) return { ok: false, reason: "already_revoked" };
  if (current.authorized_at) return { ok: false, reason: "already_authorised" };
  return {
    ok: true,
    patch: { authorized_at: at, status: "authorized" },
    event: { kind: "engagement_authorized", to: "authorized", subject: subjectOf(current), reason: null },
  };
}

export function revokeEngagement(
  current: Pick<Engagement, "authorized_at" | "revoked_at" | "scope_note" | "service_code">,
  reason: string,
  at = new Date().toISOString(),
):
  | { ok: true; patch: { revoked_at: string; status: "revoked" }; event: EngagementEvent }
  | { ok: false; reason: "already_revoked" | "reason_required" } {
  if (current.revoked_at) return { ok: false, reason: "already_revoked" };
  const why = reason.trim();
  if (!why) return { ok: false, reason: "reason_required" };
  return {
    ok: true,
    patch: { revoked_at: at, status: "revoked" },
    event: { kind: "engagement_revoked", to: "revoked", subject: subjectOf(current), reason: why },
  };
}

/**
 * A returning client's fresh engagement: a draft with no grant and no consent.
 * The firm must not authorise it alone; the taxpayer accepts it here.
 * An engagement the firm already authorised (authorized_at set) is not this draft.
 */
export function freshDraftNeedsAcceptance(e: {
  status: string;
  accepted_at: string | null;
  authorized_at: string | null;
  revoked_at: string | null;
}): boolean {
  return e.status === "draft" && !e.accepted_at && !e.authorized_at && !e.revoked_at;
}

export type DraftEngagement = {
  taxpayer_id: string;
  /**
   * 'draft', not 'pending'. The `engagements_status_known` CHECK added in
   * 20261029213000 names six states -- draft, invited, accepted, authorized,
   * revoked, expired -- and 'pending' is not among them, so every insert
   * through this path was refused from the moment that migration landed.
   */
  status: "draft";
  authorized_at: null;
  revoked_at: null;
  accepted_at: null;
  service_code: string | null;
  scope_note: string | null;
  fee_xaf: number | null;
  assigned_to: string | null;
};

/**
 * A mission the firm has drafted and the client has not yet authorised.
 *
 * `authorized_at` stays null on purpose. Inserting `status: authorized` with
 * no timestamp is how every row used to look authorised the moment it existed.
 */
export function draftEngagement(input: {
  taxpayerId: string;
  serviceCode?: string | null;
  scopeNote?: string | null;
  feeXaf?: number | null;
  assignedTo?: string | null;
}): { ok: true; row: DraftEngagement } | { ok: false; reason: "taxpayer_required" | "fee_invalid" } {
  const taxpayerId = input.taxpayerId.trim();
  if (!taxpayerId) return { ok: false, reason: "taxpayer_required" };
  const fee = input.feeXaf ?? null;
  if (fee !== null && (!Number.isInteger(fee) || fee < 0)) {
    return { ok: false, reason: "fee_invalid" };
  }
  const clean = (v: string | null | undefined) => {
    const t = v?.trim();
    return t ? t : null;
  };
  return {
    ok: true,
    row: {
      taxpayer_id: taxpayerId,
      status: "draft",
      authorized_at: null,
      revoked_at: null,
      accepted_at: null,
      service_code: clean(input.serviceCode),
      scope_note: clean(input.scopeNote),
      fee_xaf: fee,
      assigned_to: clean(input.assignedTo),
    },
  };
}

export const ENGAGEMENT_REFUSAL_LABELS: Record<EngagementRefusal, { fr: string; en: string }> = {
  already_authorised: {
    fr: "Cette mission est déjà autorisée.",
    en: "This engagement is already authorised.",
  },
  already_revoked: {
    fr: "Cette mission est révoquée. Une nouvelle mission est nécessaire pour poursuivre.",
    en: "This engagement is revoked. Continuing needs a new engagement.",
  },
  reason_required: {
    fr: "Une révocation exige un motif. Le client le verra.",
    en: "A revocation needs a reason. The client will see it.",
  },
  taxpayer_required: {
    fr: "Choisissez le client de cette mission.",
    en: "Choose the client for this engagement.",
  },
  fee_invalid: {
    fr: "Les honoraires sont un nombre entier de francs, ou bien ils ne sont pas encore fixés.",
    en: "The fee is a whole number of francs, or it is not agreed yet.",
  },
};

/**
 * What the database refused when an engagement write came back as an error.
 *
 * `private.engagements_grant_guard()` (migration 20261030070000, F-01) holds
 * the four rules RLS cannot express, and it raises a message rather than
 * returning no rows. Without this mapping the screen shows a generic failure
 * for a refusal the accountant can act on -- above all the first one, which is
 * not a fault but a fact about the taxpayer.
 *
 * Matching on the message text couples this to the migration. Both live in this
 * repository and the messages are fixed strings; anything unrecognised returns
 * null and the caller keeps its own generic wording.
 */
export type EngagementWriteRefusal =
  | "taxpayer_holds_another_firm"
  | "acceptance_is_the_taxpayers"
  | "engagement_cannot_move"
  | "revocation_is_final";

export function engagementWriteRefusal(detail: string | null | undefined): EngagementWriteRefusal | null {
  const d = (detail ?? "").toLowerCase();
  if (!d) return null;
  if (d.includes("another firm holds this taxpayer")) return "taxpayer_holds_another_firm";
  if (d.includes("only the taxpayer records acceptance")) return "acceptance_is_the_taxpayers";
  if (d.includes("cannot be moved to another firm or another taxpayer")) return "engagement_cannot_move";
  if (d.includes("cannot be un-revoked")) return "revocation_is_final";
  return null;
}

export const ENGAGEMENT_WRITE_REFUSAL_LABELS: Record<EngagementWriteRefusal, { fr: string; en: string }> = {
  taxpayer_holds_another_firm: {
    fr: "Un autre cabinet suit déjà ce contribuable. Lui seul peut autoriser un second cabinet.",
    en: "Another firm already works with this taxpayer. Only the taxpayer can bring in a second firm.",
  },
  acceptance_is_the_taxpayers: {
    fr: "L'acceptation appartient au contribuable. Vous ne pouvez pas la saisir à sa place.",
    en: "Acceptance belongs to the taxpayer. You cannot record it for them.",
  },
  engagement_cannot_move: {
    fr: "Une mission ne change ni de cabinet ni de contribuable. Créez-en une nouvelle.",
    en: "An engagement cannot change firm or taxpayer. Create a new one.",
  },
  revocation_is_final: {
    fr: "Une mission révoquée ne peut pas être rétablie. Une nouvelle mission est nécessaire.",
    en: "A revoked engagement cannot be restored. A new engagement is needed.",
  },
};
