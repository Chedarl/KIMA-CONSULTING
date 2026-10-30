/**
 * The partner-facing staff actions, and the words for every way they can be
 * refused.
 *
 * `manage_firm_staff()` (migration 20261030201000) is the only route into
 * `firm_members`: the table has no write policy and is not getting one. So this
 * module is deliberately thin — it shapes the three calls and translates the
 * function's refusals, and it does not decide anything the database decides.
 *
 * WHY THE REFUSALS ARE LISTED BY MESSAGE. The function raises seven distinct
 * errors and they mean different things to the person reading them: one is "you
 * are not a partner", another is "that address belongs to a client account",
 * another is "somebody already has it". A single "could not save" would hide
 * which, and three of the seven are actionable by the partner alone.
 * `scripts/firm-staff-check.mjs` parses the migration and fails if the function
 * raises a message this map does not carry, so the two cannot drift.
 */

import type { FirmRole } from "./permissions";
import { supabase } from "./supabase";

/** Only these two are assignable. A partner cannot mint another partner. */
export const ASSIGNABLE_STAFF_ROLES = ["firm_staff", "firm_reviewer"] as const;
export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

export function isAssignableStaffRole(value: string): value is AssignableStaffRole {
  return (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(value);
}

export type StaffRefusal =
  | "not_a_partner"
  | "unsupported_action"
  | "invalid_invite"
  | "identity_is_a_client"
  | "not_manageable"
  | "role_not_assignable"
  | "already_in_use"
  | "unknown";

/**
 * The exact substring each refusal raises, as the migration writes it. Matched
 * on the substring rather than the whole string because PostgREST wraps the
 * message, and keyed in the order the function can raise them.
 */
export const STAFF_REFUSAL_SIGNATURES: ReadonlyArray<readonly [string, StaffRefusal]> = [
  ["active firm partner required", "not_a_partner"],
  ["unsupported staff action", "unsupported_action"],
  ["valid staff name, email and role required", "invalid_invite"],
  ["identity is already used by a client", "identity_is_a_client"],
  ["staff member not manageable", "not_manageable"],
  ["only staff and reviewer roles are supported", "role_not_assignable"],
  ["staff name or email already in use", "already_in_use"],
];

export function staffRefusal(message: string | null | undefined): StaffRefusal {
  const text = (message ?? "").toLowerCase();
  for (const [signature, refusal] of STAFF_REFUSAL_SIGNATURES) {
    if (text.includes(signature.toLowerCase())) return refusal;
  }
  return "unknown";
}

export type StaffMember = {
  id: string;
  person_label: string;
  role: FirmRole;
  active: boolean;
  deactivated_at: string | null;
};

type RpcResult = { ok: true; memberId: string } | { ok: false; refusal: StaffRefusal };

async function call(
  action: "invite" | "role" | "revoke",
  args: { memberId?: string | null; email?: string | null; label?: string | null; role?: AssignableStaffRole | null },
): Promise<RpcResult> {
  const { data, error } = await supabase().rpc("manage_firm_staff", {
    p_action: action,
    p_member_id: args.memberId ?? null,
    p_email: args.email ?? null,
    p_label: args.label ?? null,
    p_role: args.role ?? null,
  });
  if (error) return { ok: false, refusal: staffRefusal(error.message) };
  return { ok: true, memberId: data as string };
}

/**
 * Creates the membership so that address can sign in. It sends NOTHING: the
 * migration says so and means it, so the partner has to tell the person
 * themselves. The screen states that rather than implying an email went out.
 */
export const inviteStaff = (email: string, label: string, role: AssignableStaffRole) =>
  call("invite", { email, label, role });

export const setStaffRole = (memberId: string, role: AssignableStaffRole) =>
  call("role", { memberId, role });

export const revokeStaff = (memberId: string) => call("revoke", { memberId });
