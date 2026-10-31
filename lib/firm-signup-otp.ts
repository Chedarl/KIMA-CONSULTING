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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6}$/;

function emailAddress(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

function rateLimited(error: { message: string; status?: number }): boolean {
  return error.status === 429 || /rate.limit|too many requests/i.test(error.message);
}

/** Supabase sends its own code; no code is created, stored or returned here. */
export async function sendFirmSignupOtp(auth: SignupOtpAuth, rawEmail: string): Promise<SignupSendResult> {
  const email = emailAddress(rawEmail);
  if (!email) return { ok: false, reason: "invalid_email" };

  try {
    const { error } = await auth.signInWithOtp({
      email, options: { shouldCreateUser: true },
    });
    if (error) return { ok: false, reason: rateLimited(error) ? "rate_limited" : "send_failed" };
    return { ok: true, email };
  } catch {
    return { ok: false, reason: "send_failed" };
  }
}

/** A verified OTP alone is not a firm membership: D must still create it. */
export async function verifyFirmSignupOtp(
  auth: SignupOtpAuth,
  rawEmail: string,
  token: string,
): Promise<SignupVerifyResult> {
  const email = emailAddress(rawEmail);
  if (!email) return { ok: false, reason: "invalid_email" };
  const code = token.trim();
  if (!CODE.test(code)) return { ok: false, reason: "invalid_code" };

  try {
    const { data, error } = await auth.verifyOtp({ email, token: code, type: "email" });
    if (error) return { ok: false, reason: rateLimited(error) ? "rate_limited" : "verification_failed" };
    if (!data?.session || !data.user?.id || data.user.email?.toLowerCase() !== email) {
      return { ok: false, reason: "session_missing" };
    }
    return { ok: true, userId: data.user.id };
  } catch {
    return { ok: false, reason: "verification_failed" };
  }
}
