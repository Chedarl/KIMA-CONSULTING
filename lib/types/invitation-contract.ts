/** Draft C-3 cross-stream types. No runtime auth or access grant. */
export type InvitationDirection = "firm_to_taxpayer" | "taxpayer_to_firm";
export type InvitationStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";
export type InvitationError =
  | "not_authenticated" | "forbidden" | "not_found"
  | "expired" | "already_decided" | "wrong_recipient"
  | "invalid_token" | "firm_suspended" | "rate_limited"
  | "not_configured" | "unexpected";
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: InvitationError };
export type InvitationSummary = {
  id: string;
  direction: InvitationDirection;
  status: InvitationStatus;
  firm_id: string;
  taxpayer_id: string | null;
  expires_at: string;
};
export type EngagementInvitationAcceptance = {
  engagement_id: string;
  engagement_status: "invited" | "accepted" | "authorized";
};
export type PortalActivationResult = {
  portal_account_id: string;
  status: "active";
};
