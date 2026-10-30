/** Phase 4 proposal, NOT an authorization boundary. */
export type WorkflowCaseStage =
  | "documents" | "accounting" | "preparation" | "review"
  | "filing" | "evidence" | "client_approval"
  | "delivered" | "abandoned" | "cancelled";
/** Transport/queue state, not a professional document verdict. */
export type DocumentIntakeStatus = "requested" | "received";
/** Three reviewer decisions; received is not one. */
export type DocumentVerdict = "accepted" | "returned" | "rejected";
export type WorkflowError =
  | "not_authenticated" | "forbidden" | "not_found"
  | "duplicate_case" | "scope_missing" | "revision_conflict"
  | "unverified_deadline" | "missing_evidence"
  | "independent_review_required" | "client_approval_required"
  | "invalid_transition" | "unexpected";
export type WorkflowResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: WorkflowError };
export type CaseSpine = {
  taxpayer_id: string;
  engagement_id: string;
  obligation_code: string;
  period_code: string;
  due_on: string | null;
  due_needs_confirmation: boolean;
};
