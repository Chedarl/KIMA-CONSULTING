/**
 * Sign-in codes, issued and verified where the privilege already lives.
 *
 * SOURCE OF RECORD. This file is the source of the `auth-codes` Edge Function
 * on project vhrnrbnjhmxrygvyfirf. Version 3 was deployed by hand and existed
 * in no repository; it was fetched read-only on 27 Oct 2026 and committed
 * here, with the fixes below. Deployed from this file on 27 Oct 2026 with the
 * owner's approval. Redeploy only from this file — see docs/deployment.md,
 * "Deploy the auth-codes Edge Function".
 *
 * Changes from deployed v3:
 * - The PATCH that binds firm_members/contacts.auth_user_id is checked. A
 *   refused binding (auth_identity_is_single, a unique violation) or one that
 *   matched no row returns an error instead of a token. v3 ignored the result
 *   and answered ok, so a failed binding produced a session every policy
 *   refused.
 * - A portal account with no contact cannot sign in (nothing to bind).
 * - Error responses no longer echo internal error text to the caller.
 * - v6: brand strings (D8)
 *
 * WHY THIS EXISTS. `portal_issue_code` and `firm_issue_code` are revoked from
 * anon and authenticated: they hand back a plaintext one-time code, so only a
 * service-role caller may run them. The Next.js routes expected
 * SUPABASE_SERVICE_ROLE_KEY in the environment, which meant copying a secret
 * that can read and write every row in the database into .env.local and into
 * Vercel. Supabase injects that key into every Edge Function at runtime, so
 * doing the privileged work HERE means the secret never leaves the platform
 * that issued it: nothing to paste, nothing to rotate in two places, nothing
 * to leak from a build log. lib/auth-codes.ts relays to it.
 *
 * It authenticates by possession of the code, which is why verify_jwt is off:
 * the caller is by definition not yet signed in.
 *
 * WHAT IT WILL NOT DO. It never returns a plaintext code for an address that
 * could belong to a real person. Revealing requires BOTH the operator switch
 * `app_flags.demo_otp_reveal` AND a destination on a domain that cannot
 * receive mail at all (demo.kima.cm, or any example.* which IANA reserves).
 * A real address goes through email or not at all. lib/auth-mail.ts applies
 * the same address rule on the Next.js path.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("KIMA_MAIL_FROM") ?? "KIMA CONSULTING <onboarding@resend.dev>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const res = await admin(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bind the Auth user to exactly one row, and say whether it worked.
 *
 * `return=representation` makes PostgREST hand back the rows it changed, so a
 * filter that matched nothing is visible as an empty array instead of the 204
 * that `return=minimal` gives either way.
 */
async function bindIdentity(
  table: "firm_members" | "contacts",
  id: string,
  userId: string,
): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const res = await admin(`/rest/v1/${table}?id=eq.${id}&select=id`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ auth_user_id: userId }),
  });
  if (!res.ok) {
    console.error(`bind ${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return false;
  }
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) && rows.length === 1;
}

/**
 * A destination that cannot receive mail, so showing its code reveals nothing
 * about a real person. example.* is reserved by IANA for exactly this.
 */
const isSyntheticAddress = (email: string) => {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain === "demo.kima.cm" || domain.startsWith("example.");
};

const revealAllowed = async (): Promise<boolean> => {
  const res = await admin("/rest/v1/app_flags?key=eq.demo_otp_reveal&select=enabled");
  if (!res.ok) return false;
  const rows = (await res.json()) as { enabled: boolean }[];
  return rows[0]?.enabled === true;
};

async function sendCode(to: string, code: string, locale: string, audience: string) {
  if (!RESEND_API_KEY) return { sent: false, reason: "mail_not_configured" };
  const fr = locale === "fr";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject: fr ? "KIMA OS — votre code d'accès" : "KIMA OS — your access code",
      text: [
        fr ? "Bonjour," : "Hello,",
        "",
        fr ? `Votre code à usage unique est : ${code}` : `Your one-time code is: ${code}`,
        "",
        fr
          ? "Il expire dans dix minutes et ne peut servir qu'une fois."
          : "It expires in ten minutes and can be used only once.",
        "",
        `— KIMA CONSULTING (${audience})`,
        "",
        fr
          ? "Message de démonstration. Aucune intégration DGI n'est établie."
          : "Demonstration message. No DGI integration is established.",
      ].join("\n"),
    }),
  });
  return { sent: res.ok, reason: res.ok ? null : `resend_${res.status}` };
}

/** Find or create the Auth user, and mint a one-time token the browser exchanges. */
async function mintSession(email: string) {
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true }),
  });
  // 422/409 means the user already exists, which is the normal case after the
  // first sign-in. Only a different failure is worth reporting.
  if (!created.ok && created.status !== 422 && created.status !== 409) {
    throw new Error(`create_user: ${created.status} ${(await created.text()).slice(0, 200)}`);
  }

  const link = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!link.ok) throw new Error(`generate_link: ${link.status} ${(await link.text()).slice(0, 200)}`);
  const body = await link.json();
  const tokenHash = body.hashed_token ?? body.properties?.hashed_token ?? null;
  const userId = body.user?.id ?? body.id ?? null;
  if (!tokenHash || !userId) throw new Error("generate_link returned no token");
  return { tokenHash, userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const audience = body.audience === "portal" ? "portal" : "firm";
  const locale = body.locale === "en" ? "en" : "fr";

  try {
    if (body.action === "request") {
      const issued =
        audience === "firm"
          ? await rpc("firm_issue_code", { p_email: (body.email ?? "").trim().toLowerCase() })
          : await rpc("portal_issue_code", {
              p_name: (body.name ?? "").trim(),
              p_identifier: (body.identifier ?? "").trim(),
            });

      // The same answer whether or not the account exists: no oracle.
      if (!issued?.ok) {
        return json({
          ok: true,
          sent: false,
          reference: null,
          maskedDestination: null,
          demoCode: null,
        });
      }

      const delivery = await sendCode(issued.destination, issued.code, locale, audience);
      const mayReveal =
        !delivery.sent && isSyntheticAddress(issued.destination) && (await revealAllowed());

      return json({
        ok: true,
        sent: delivery.sent,
        reference: issued.reference,
        maskedDestination: issued.masked_destination,
        demoCode: mayReveal ? issued.code : null,
        // Say why nothing arrived rather than leaving a blank screen.
        note: delivery.sent ? null : mayReveal ? "revealed_synthetic" : delivery.reason,
      });
    }

    if (body.action === "verify") {
      const code = (body.code ?? "").replace(/\D/g, "");
      const reference = body.reference ?? "";
      if (!UUID.test(reference) || code.length < 6) return json({ error: "bad_request" }, 400);

      const checked =
        audience === "firm"
          ? await rpc("firm_verify_code", { p_reference: reference, p_code: code })
          : await rpc("portal_verify_code", { p_reference: reference, p_code: code });

      if (!checked?.ok) return json({ error: checked?.reason ?? "no_match" }, 401);

      const email = audience === "firm" ? checked.email : checked.contact_email;
      if (!email) return json({ error: "no_destination" }, 422);
      // A portal account with no contact has nothing to bind the session to:
      // client_taxpayer_ids() would answer nothing and every screen would fail.
      if (audience === "portal" && !checked.contact_id) {
        return json({ error: "no_destination" }, 422);
      }

      const { tokenHash, userId } = await mintSession(email);

      // Binding the identity is what makes member_has() and
      // client_taxpayer_ids() start answering true for this session. If it is
      // refused, the sign-in has not happened: return no token.
      if (audience === "firm") {
        if (!(await bindIdentity("firm_members", checked.member_id, userId))) {
          return json({ error: "binding_failed" }, 409);
        }

        return json({
          ok: true,
          tokenHash,
          member: {
            id: checked.member_id,
            personLabel: checked.person_label,
            email: checked.email,
            role: checked.role,
          },
        });
      }

      if (!(await bindIdentity("contacts", checked.contact_id, userId))) {
        return json({ error: "binding_failed" }, 409);
      }

      // The portal shows the profile it signed in to. Read here because the
      // caller has no privileged client of its own.
      const tpRes = await admin(
        `/rest/v1/taxpayers?id=eq.${checked.taxpayer_id}` +
          "&select=id,legal_name,taxpayer_type,niu,tax_centre,tax_regime,profile_verified",
      );
      const tp = tpRes.ok ? ((await tpRes.json())[0] ?? null) : null;
      if (!tp) return json({ error: "taxpayer_missing" }, 500);

      return json({
        ok: true,
        tokenHash,
        session: {
          taxpayerId: tp.id,
          displayName: tp.legal_name ?? checked.display_name,
          taxpayerType: tp.taxpayer_type ?? null,
          niu: tp.niu ?? null,
          taxCentre: tp.tax_centre ?? null,
          taxRegime: tp.tax_regime ?? null,
          profileVerified: Boolean(tp.profile_verified),
        },
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    // Logged for the operator; never echoed to an unauthenticated caller.
    console.error("auth-codes:", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 502);
  }
});
