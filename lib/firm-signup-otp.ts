/**
 * Phase 2, contract C: Supabase Auth's own email OTP for new firm owners.
 * Does NOT create a firm or grant any organisation permission.
 */
export type SignupOtpAuth = {
  signInWithOtp(input: { email: string; options: { shouldCreateUser: true } }):
    Promise<{ error: { message: string; status?: number } | null }>;
  verifyOtp(input: { email: string; token: string; type: "email" }):
    Promise<{
      data: { user: { id: string; email?: string | null } | null; session: unknown | null };
      error: { message: string; status?: number } | null;
    }>;
};

export type SignupSendResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid_email" | "rate_limited" | "send_failed" };

export type SignupVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid_email" | "invalid_code" | "rate_limited" | "verification_failed" | "session_missing" };

export async function sendFirmSignupOtp(_auth: SignupOtpAuth, _rawEmail: string): Promise<SignupSendResult> {
  return { ok: false, reason: "send_failed" };
}

export async function verifyFirmSignupOtp(_auth: SignupOtpAuth, _rawEmail: string, _token: string): Promise<SignupVerifyResult> {
  return { ok: false, reason: "verification_failed" };
}
