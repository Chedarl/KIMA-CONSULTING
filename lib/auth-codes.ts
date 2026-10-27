/**
 * The sign-in code path, when there is no service-role key to hold.
 *
 * `portal_issue_code` and `firm_issue_code` return a plaintext one-time code,
 * so they are revoked from anon and authenticated and only a service-role
 * caller may run them. The four API routes beside this file expect
 * `SUPABASE_SERVICE_ROLE_KEY` in the environment — a key that can read and
 * write every row in the database, copied into `.env.local` and into Vercel,
 * and rotated in both whenever it leaks.
 *
 * It does not have to live there at all. Supabase injects that key into every
 * Edge Function at runtime, so the `auth-codes` function
 * (`supabase/functions/auth-codes/index.ts`) does the privileged work and the
 * secret never leaves the platform that issued it.
 *
 * So: when the service key IS configured the routes keep their direct path;
 * when it is not, they come here instead of answering 503. Same request
 * shapes, same response shapes, deliberately — the browser cannot tell which
 * one served it.
 *
 * Callers: app/api/firm/{request,verify}-code/route.ts and
 * app/api/portal/{request,verify}-code/route.ts.
 */

export const edgeAuthConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Call the function and hand back exactly what it said.
 *
 * The status travels with the body: a wrong code is a 401 from the function
 * and must stay a 401 to the browser, or `lib/firm-auth.ts` cannot tell
 * "wrong code" from "the server fell over".
 */
export async function callAuthCodes(
  payload: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { status: 503, body: { error: "not_configured" } };

  try {
    const res = await fetch(`${url}/functions/v1/auth-codes`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      // Never cached: every response carries a one-time reference.
      cache: "no-store",
    });
    return { status: res.status, body: await res.json() };
  } catch {
    return { status: 502, body: { error: "issue_failed" } };
  }
}
