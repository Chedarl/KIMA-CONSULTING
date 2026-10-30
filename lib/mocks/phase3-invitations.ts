/** Q-2: synthetic-only mock adapter. NEVER use to authorize a real engagement. */
import type {
  ActionResult, EngagementInvitationAcceptance, InvitationDirection,
  InvitationStatus,
} from "../types/invitation-contract";

export type DemoCompany = { taxpayer_id: string; niu: string; owner_id: string };
export type DemoFirm = { id: string; name: string };
export type DemoPrincipal = {
  id: string;
  email: string;
  owned_companies: string[];
  firm_ids: string[];
};
export type DemoInvitation = {
  id: string;
  direction: InvitationDirection;
  status: InvitationStatus;
  firm_id: string;
  taxpayer_id: string;
  recipient_email: string;
  expires_at: string;
};

/** Same person owns two companies; each has a different appointed firm. */
export const demoCompanies: readonly DemoCompany[] = [
  { taxpayer_id: "company-a", niu: "SYNTHETIC-NIU-A", owner_id: "owner-one" },
  { taxpayer_id: "company-b", niu: "SYNTHETIC-NIU-B", owner_id: "owner-one" },
];
export const demoFirms: readonly DemoFirm[] = [
  { id: "firm-a", name: "Synthetic Firm A" },
  { id: "firm-b", name: "Synthetic Firm B" },
];
export const demoOwner: DemoPrincipal = {
  id: "owner-one",
  email: "owner@example.test",
  owned_companies: ["company-a", "company-b"],
  firm_ids: [],
};
export const demoPartners: readonly DemoPrincipal[] = [
  { id: "partner-a", email: "a@example.test", owned_companies: [], firm_ids: ["firm-a"] },
  { id: "partner-b", email: "b@example.test", owned_companies: [], firm_ids: ["firm-b"] },
];

/** For mock UI previews only. Real tokens, identities and grants require the DB RPC. */
export function previewInvitationAcceptance(
  invitation: DemoInvitation,
  actor: DemoPrincipal | null,
  now: string,
): ActionResult<EngagementInvitationAcceptance> {
  if (!actor) return { ok: false, code: "not_authenticated" };
  if (invitation.status !== "pending") return { ok: false, code: "already_decided" };
  if (Date.parse(now) >= Date.parse(invitation.expires_at)) {
    return { ok: false, code: "expired" };
  }
  if (invitation.direction === "firm_to_taxpayer") {
    if (actor.email.toLowerCase() !== invitation.recipient_email.toLowerCase() ||
        !actor.owned_companies.includes(invitation.taxpayer_id)) {
      return { ok: false, code: "wrong_recipient" };
    }
  } else if (!actor.firm_ids.includes(invitation.firm_id)) {
    return { ok: false, code: "forbidden" };
  }
  return {
    ok: true,
    data: {
      engagement_id: "mock-only:" + invitation.id,
      engagement_status: "accepted",
    },
  };
}

export function previewAccessibleCompanies(
  actor: DemoPrincipal,
  assignments: readonly { firm_id: string; taxpayer_id: string }[],
): string[] {
  if (!actor.firm_ids.length) return [...actor.owned_companies];
  return assignments
    .filter((a) => actor.firm_ids.includes(a.firm_id))
    .map((a) => a.taxpayer_id);
}
