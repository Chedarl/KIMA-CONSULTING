/** Phase 2 firm registration: client-side hygiene only, never an ONECCA rule. */
export type FirmSignupInput = {
  email: string;
  firmName: string;
  registrationNumber: string;
  ownerName: string;
};
export type FirmSignupIssue = "email" | "firmName" | "registrationNumber" | "ownerName";
export type FirmSignupFailure = "invalid_email" | "invalid_code" | "rate_limited"
  | "send_failed" | "verification_failed" | "session_missing"
  | "duplicate" | "disabled" | "invalid_details" | "failed";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function canonicalRegistrationNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}
/** Mirrors the D2 database hygiene. No claim is made about official numbering. */
export function firmSignupIssues(input: FirmSignupInput): FirmSignupIssue[] {
  const errors: FirmSignupIssue[] = [];
  const email = input.email.trim();
  if (email.length > 254 || !EMAIL.test(email)) errors.push("email");
  if (input.firmName.trim().length < 2 || input.firmName.trim().length > 120) errors.push("firmName");
  if (input.ownerName.trim().length < 2 || input.ownerName.trim().length > 120) errors.push("ownerName");
  if (!/^[A-Z0-9][A-Z0-9./_-]{2,62}[A-Z0-9]$/.test(
    canonicalRegistrationNumber(input.registrationNumber),
  )) errors.push("registrationNumber");
  return errors;
}
/** Handle only stable SQLSTATE values. Never display raw database error messages. */
export function signupRpcFailure(code?: string): FirmSignupFailure {
  if (code === "23505") return "duplicate";
  if (code === "42501") return "disabled";
  if (code === "22023") return "invalid_details";
  return "failed";
}
