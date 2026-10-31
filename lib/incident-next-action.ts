/** Phase 6: pure, non-authoritative incident presentation logic.
 * Only a server-side reviewer with verified official evidence may set
 * officially_verified. Never derive official payment status from a debit.
 */
export type IncidentSnapshot = {
  debitObserved: boolean;
  officialPaymentVerified: boolean;
  disputed: boolean;
  evidenceAttached: boolean;
  reviewerAssigned: boolean;
  supportReferencePresent: boolean;
};
export type NextActionCode =
  | "request_official_evidence"
  | "attach_debit_evidence"
  | "assign_reviewer"
  | "contact_official_support"
  | "await_reviewer"
  | "archive_verified";
export type IncidentView = {
  paymentLabel: "officially_verified" | "not_verified";
  nextAction: NextActionCode;
  severity: "normal" | "attention";
};
/** Exactly one next action, ordered by evidence and review safety. */
export function incidentView(s: IncidentSnapshot): IncidentView {
  if (s.officialPaymentVerified)
    return { paymentLabel: "officially_verified", nextAction: "archive_verified", severity: "normal" };
  if (s.debitObserved && !s.evidenceAttached)
    return { paymentLabel: "not_verified", nextAction: "attach_debit_evidence", severity: "attention" };
  if (!s.reviewerAssigned)
    return { paymentLabel: "not_verified", nextAction: "assign_reviewer", severity: "attention" };
  if (s.disputed && !s.supportReferencePresent)
    return { paymentLabel: "not_verified", nextAction: "contact_official_support", severity: "attention" };
  return {
    paymentLabel: "not_verified",
    nextAction: s.debitObserved ? "await_reviewer" : "request_official_evidence",
    severity: s.debitObserved ? "attention" : "normal",
  };
}
