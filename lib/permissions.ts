/**
 * Who may do what.
 *
 * TWO KINDS OF ACTOR, AND THEY ARE NOT SYMMETRICAL. A client's access comes
 * from a LINK — this contact, that taxpayer file — and can never reach beyond
 * the files they are linked to. A firm member's access comes from a ROLE in the
 * firm. Modelling both as "a user with a permission set" is how a client ends
 * up one misconfigured row away from somebody else's documents, so they are
 * separate types here and the capability tables do not overlap.
 *
 * CAPABILITIES ARE DATA. A matrix, not a thicket of `if (role === ...)` spread
 * through the application. The question "what can a reviewer do?" has to be
 * answerable by reading one table, or nobody can audit it — and this is
 * precisely the kind of rule that gets quietly widened by a hurried fix.
 *
 * THE ADMIN IS NOT A PROFESSIONAL. `kima_admin` can manage members and the rule
 * corpus and can see a case; it cannot review a document, verify a filing or
 * authorise an engagement. Platform administration and professional judgement
 * are different authorities, and a product that merges them lets whoever
 * administers the server sign off on somebody's tax return.
 *
 * Pure functions. Whether an actor may do a thing is answerable without a
 * database, which is what makes it testable.
 */

import type { ComplianceCase } from "./cases";

// ---------------------------------------------------------------------------
// Firm members
// ---------------------------------------------------------------------------

export type FirmRole = "firm_staff" | "firm_reviewer" | "firm_partner" | "kima_admin";

export type FirmMember = {
  id: string;
  person_label: string;
  email: string | null;
  role: FirmRole;
  active: boolean;
  deactivated_at: string | null;
};

export type Capability =
  // the case itself
  | "case.view"
  | "case.advance"
  | "case.assign"
  // documents and requests
  | "request.create"
  | "request.return"
  | "document.review"
  // the four dimensions
  | "filing.record"
  | "filing.verify"
  | "payment.record"
  | "billing.view"
  | "billing.manage"
  // authority
  | "engagement.create"
  | "engagement.authorize"
  | "engagement.revoke"
  // the record
  | "event.view_internal"
  | "note.write_client"
  | "dossier.export"
  // the platform
  | "member.manage"
  | "rule.manage";

/**
 * What a member of staff does: the work, and the first pass over documents.
 *
 * `filing.record` without `filing.verify` is the important split. Staff may
 * record that a submission was attempted — a fact about what they did — but
 * not that it was verified, which is a claim about what the administration
 * acknowledged. Only a reviewer closes that gap.
 */
const STAFF: Capability[] = [
  "case.view",
  "case.advance",
  "request.create",
  "request.return",
  "document.review",
  "filing.record",
  "payment.record",
  "event.view_internal",
  "note.write_client",
];

const REVIEWER: Capability[] = [...STAFF, "case.assign", "filing.verify", "dossier.export"];

const PARTNER: Capability[] = [
  ...REVIEWER,
  "billing.view",
  "billing.manage",
  "engagement.create",
  "engagement.authorize",
  "engagement.revoke",
  "member.manage",
];

/**
 * Deliberately narrow, and deliberately not a superset of anything.
 *
 * An administrator keeps the lights on. They can see that a case exists and
 * manage who the members are; they cannot touch a document, a filing, an
 * engagement or a client's money. Nothing about running a server qualifies
 * anyone to approve a tax return.
 */
const ADMIN: Capability[] = ["case.view", "member.manage", "rule.manage"];

export const ROLE_CAPABILITIES: Record<FirmRole, Capability[]> = {
  firm_staff: STAFF,
  firm_reviewer: REVIEWER,
  firm_partner: PARTNER,
  kima_admin: ADMIN,
};

/**
 * How far a role reaches.
 *
 * Staff see the clients they are given. A reviewer and a partner need the whole
 * book — a reviewer who can only see their own work cannot review anyone
 * else's, which defeats the point of having one.
 */
export const reachOf = (role: FirmRole): "assigned" | "firm_wide" =>
  role === "firm_staff" ? "assigned" : "firm_wide";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type ClientCapability =
  | "case.view"
  | "document.upload"
  | "request.submit"
  | "note.write"
  | "dossier.download";

/**
 * Everything a client may do, in one list.
 *
 * `event.view_internal` is absent and must stay absent: the internal history
 * includes review verdicts, refused gates and notes written between
 * colleagues. The client gets the client-visible timeline, which is a
 * different thing built from the same rows.
 */
export const CLIENT_CAPABILITIES: ClientCapability[] = [
  "case.view",
  "document.upload",
  "request.submit",
  "note.write",
  "dossier.download",
];

/** A client's reach: the taxpayer files this contact is actually linked to. */
export type ClientAccess = { contact_id: string; taxpayer_ids: string[] };

// ---------------------------------------------------------------------------
// Asking the question
// ---------------------------------------------------------------------------

export type Actor =
  | { kind: "firm"; member: FirmMember; assignedTaxpayerIds?: string[] }
  | { kind: "client"; access: ClientAccess }
  | { kind: "system" };

export type DenialReason =
  | "inactive_member"
  | "role_lacks_capability"
  | "outside_assigned_clients"
  | "not_linked_to_taxpayer"
  | "clients_cannot_do_this"
  | "system_cannot_exercise_judgement";

export type Decision = { ok: true } | { ok: false; reason: DenialReason };

const ALLOW: Decision = { ok: true };
const deny = (reason: DenialReason): Decision => ({ ok: false, reason });

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What the system itself may do on its own initiative: generate, remind,
 * record. Never decide.
 *
 * A scheduled job may open a case from a verified obligation. It may not accept
 * a document, verify a filing or approve a review, because those are judgements
 * and a judgement needs somebody answerable for it.
 */
const SYSTEM_CAPABILITIES: Capability[] = ["case.view", "case.advance", "request.create"];

/**
 * May this actor do this thing, to this taxpayer's work?
 *
 * Returns a named reason rather than a bare false, so a surface can say why
 * instead of making a button mysteriously disappear.
 */
export function can(
  actor: Actor,
  capability: Capability | ClientCapability,
  taxpayerId?: string,
): Decision {
  if (actor.kind === "system") {
    return SYSTEM_CAPABILITIES.includes(capability as Capability)
      ? ALLOW
      : deny("system_cannot_exercise_judgement");
  }

  if (actor.kind === "client") {
    if (!CLIENT_CAPABILITIES.includes(capability as ClientCapability)) {
      return deny("clients_cannot_do_this");
    }
    // A client capability with no file to exercise it on is meaningless, and
    // defaulting to "allowed" here would be the whole breach.
    if (!taxpayerId || !actor.access.taxpayer_ids.includes(taxpayerId)) {
      return deny("not_linked_to_taxpayer");
    }
    return ALLOW;
  }

  // Checked before the matrix: a deactivated member is not a member with fewer
  // powers, it is a member with none.
  if (!actor.member.active) return deny("inactive_member");

  if (!ROLE_CAPABILITIES[actor.member.role].includes(capability as Capability)) {
    return deny("role_lacks_capability");
  }

  if (reachOf(actor.member.role) === "assigned") {
    const assigned = actor.assignedTaxpayerIds ?? [];
    // Absent assignment information denies rather than permits — the same rule
    // the case gates follow. A staff member with no clients listed has no
    // clients, not every client.
    if (!taxpayerId || !assigned.includes(taxpayerId)) return deny("outside_assigned_clients");
  }

  return ALLOW;
}

/** The capabilities an actor actually holds, for building a surface. */
export function capabilitiesOf(actor: Actor): (Capability | ClientCapability)[] {
  if (actor.kind === "system") return [...SYSTEM_CAPABILITIES];
  if (actor.kind === "client") return [...CLIENT_CAPABILITIES];
  if (!actor.member.active) return [];
  return [...ROLE_CAPABILITIES[actor.member.role]];
}

// ---------------------------------------------------------------------------
// Separation of duties
// ---------------------------------------------------------------------------

export type ApprovalProblem =
  | "no_preparer_recorded"
  | "self_approval_not_permitted"
  | "self_approval_not_disclosed"
  | "not_authorised_to_approve";

export type ApprovalDecision =
  | { ok: true; selfApproved: boolean }
  | { ok: false; reason: ApprovalProblem };

/**
 * May this person pass the work through review?
 *
 * The oldest control in the trade: whoever prepared a return should not be the
 * one who signs it off. The twist is that KIMA's first customer is a sole
 * practitioner, for whom a hard rule is not a control but a wall — so:
 *
 *   - a firm that can staff a second pair of eyes sets `requireSecondReview`,
 *     and self-approval is refused outright;
 *   - a sole practitioner leaves it off, and self-approval is permitted but
 *     must be DISCLOSED. The disclosure travels with the case into the client's
 *     dossier.
 *
 * Self-approval is never silent, in either configuration. A disclosure that is
 * checked beats a prohibition that gets worked around, and the database holds
 * the same rule as a CHECK constraint.
 */
export function canApproveReview(
  c: Pick<ComplianceCase, "prepared_by">,
  approver: Actor,
  options: { requireSecondReview?: boolean; discloseSelfApproval?: boolean } = {},
): ApprovalDecision {
  if (approver.kind !== "firm") return { ok: false, reason: "not_authorised_to_approve" };
  const verdict = can(approver, "filing.verify");
  if (!verdict.ok) return { ok: false, reason: "not_authorised_to_approve" };

  // Nothing to check against. Treated as a problem rather than waved through,
  // because a case that reached review with nobody recorded as having prepared
  // it has lost the audit trail this control depends on.
  if (!c.prepared_by) return { ok: false, reason: "no_preparer_recorded" };

  if (!same(c.prepared_by, approver.member.person_label)) {
    return { ok: true, selfApproved: false };
  }

  if (options.requireSecondReview) return { ok: false, reason: "self_approval_not_permitted" };
  if (!options.discloseSelfApproval) return { ok: false, reason: "self_approval_not_disclosed" };
  return { ok: true, selfApproved: true };
}

export const APPROVAL_LABELS: Record<ApprovalProblem, { fr: string; en: string }> = {
  no_preparer_recorded: {
    fr: "Aucun préparateur enregistré : la piste d'audit est incomplète.",
    en: "No preparer on record: the audit trail is incomplete.",
  },
  self_approval_not_permitted: {
    fr: "Une seconde revue par une autre personne est requise.",
    en: "A second review by another person is required.",
  },
  self_approval_not_disclosed: {
    fr: "Auto-validation possible, mais elle doit être déclarée au dossier.",
    en: "Self-approval is possible, but it must be disclosed on the file.",
  },
  not_authorised_to_approve: {
    fr: "Cette personne n'a pas qualité pour valider une revue.",
    en: "This person is not authorised to approve a review.",
  },
};

export const approvalLabel = (p: ApprovalProblem, locale: "fr" | "en") =>
  locale === "fr" ? APPROVAL_LABELS[p].fr : APPROVAL_LABELS[p].en;

export const DENIAL_LABELS: Record<DenialReason, { fr: string; en: string }> = {
  inactive_member: {
    fr: "Ce compte est désactivé.",
    en: "This account is deactivated.",
  },
  role_lacks_capability: {
    fr: "Votre rôle ne permet pas cette action.",
    en: "Your role does not allow this action.",
  },
  outside_assigned_clients: {
    fr: "Ce client ne vous est pas attribué.",
    en: "This client is not assigned to you.",
  },
  not_linked_to_taxpayer: {
    fr: "Vous n'avez pas accès à ce dossier.",
    en: "You do not have access to this file.",
  },
  clients_cannot_do_this: {
    fr: "Cette action appartient au cabinet.",
    en: "This action belongs to the firm.",
  },
  system_cannot_exercise_judgement: {
    fr: "Cette décision exige une personne responsable.",
    en: "This decision requires an accountable person.",
  },
};

export const denialLabel = (r: DenialReason, locale: "fr" | "en") =>
  locale === "fr" ? DENIAL_LABELS[r].fr : DENIAL_LABELS[r].en;

/**
 * Whether this firm should require a second pair of eyes at all.
 *
 * Derived from the active membership rather than configured, so a firm that
 * hires its second professional gets the control switched on by the act of
 * hiring and nobody has to remember a setting. One active professional means
 * the disclosure route; two or more means a real second review is expected.
 * Administrators are excluded from the count because they cannot review.
 */
export const requiresSecondReview = (members: FirmMember[]): boolean =>
  members.filter((m) => m.active && m.role !== "kima_admin").length > 1;
