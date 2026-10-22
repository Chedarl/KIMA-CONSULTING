import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER ONLY.
 *
 * Used to issue OTP codes (plaintext once for delivery) and to mint Auth
 * sessions after a successful verify. Never import this from a client component.
 */
let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export const isSupabaseAdminConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Find or create an Auth user for `email`, then return a magic-link token hash
 * the browser can exchange via `supabase.auth.verifyOtp`.
 */
export async function mintAuthSession(email: string): Promise<
  | { ok: true; userId: string; tokenHash: string; email: string }
  | { ok: false; reason: string }
> {
  const db = supabaseAdmin();
  const normalised = email.trim().toLowerCase();

  const created = await db.auth.admin.createUser({
    email: normalised,
    email_confirm: true,
  });

  let userId = created.data.user?.id ?? null;
  if (created.error || !userId) {
    const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = listed.data.users.find((u) => u.email?.toLowerCase() === normalised);
    if (!existing) {
      return { ok: false, reason: created.error?.message ?? "user_create_failed" };
    }
    userId = existing.id;
  }

  const link = await db.auth.admin.generateLink({
    type: "magiclink",
    email: normalised,
  });
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash) {
    return { ok: false, reason: link.error?.message ?? "link_failed" };
  }

  return { ok: true, userId, tokenHash, email: normalised };
}
