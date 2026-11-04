/**
 * Portal sign-in — name + taxpayer number as IDENTIFIER, one-time code as secret.
 *
 * The NIU is printed on every invoice and is the DGI's Harmony username. It
 * identifies a taxpayer; it must not authenticate one. The secret is an 8-digit
 * code delivered to the contact address collected at onboarding.
 *
 * After verify, the browser exchanges a magic-link token hash for a real
 * Supabase Auth session so RLS can leave the anon demo branch.
 */

import { supabase } from "./supabase";
import { taxpayerType, type Regime, type TaxCentre, type TaxpayerType } from "./rules";

export type PortalAudience = "individual" | "business";

export type PortalSession = {
  taxpayerId: string;
  displayName: string;
  taxpayerType: TaxpayerType | null;
  niu: string | null;
  taxCentre: TaxCentre | null;
  taxRegime: Regime | null;
  profileVerified: boolean;
  audience: PortalAudience;
  signedInAt: string;
};

export const normaliseTaxNumber = (raw: string): string =>
  raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const normaliseName = (raw: string): string => raw.trim().replace(/\s+/g, " ");

export type RequestCodeResult =
  | {
      ok: true;
      reference: string | null;
      maskedDestination: string | null;
      demoCode: string | null;
      sent: boolean;
    }
  | { ok: false; reason: "incomplete" | "not_configured" | "error" };

export async function requestPortalCode(
  name: string,
  taxNumber: string,
  locale: "fr" | "en",
): Promise<RequestCodeResult> {
  const cleanName = normaliseName(name);
  const cleanNumber = normaliseTaxNumber(taxNumber);
  if (!cleanName || !cleanNumber) return { ok: false, reason: "incomplete" };

  try {
    const res = await fetch("/api/portal/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName, identifier: cleanNumber, locale }),
    });
    if (res.status === 503) return { ok: false, reason: "not_configured" };
    if (!res.ok) return { ok: false, reason: "error" };
    const body = (await res.json()) as {
      reference: string | null;
      maskedDestination: string | null;
      demoCode: string | null;
      sent: boolean;
    };
    return {
      ok: true,
      reference: body.reference,
      maskedDestination: body.maskedDestination,
      demoCode: body.demoCode,
      sent: body.sent,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export type VerifyCodeResult =
  | { ok: true; session: PortalSession }
  | {
      ok: false;
      reason: "incomplete" | "wrong_code" | "expired" | "too_many_attempts" | "error" | "no_match";
    };

export async function verifyPortalCode(
  audience: PortalAudience,
  reference: string,
  code: string,
): Promise<VerifyCodeResult> {
  const cleanCode = code.replace(/\D/g, "");
  if (!reference || cleanCode.length < 6) return { ok: false, reason: "incomplete" };

  try {
    const res = await fetch("/api/portal/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, code: cleanCode }),
    });
    const body = (await res.json()) as {
      error?: string;
      tokenHash?: string | null;
      session?: {
        taxpayerId: string;
        displayName: string;
        taxpayerType: string | null;
        niu: string | null;
        taxCentre: string | null;
        taxRegime: string | null;
        profileVerified: boolean;
      };
    };

    // No token means no database session: every policy would refuse this
    // client, so a "signed-in" screen would be a lie. Treat it as a failure.
    if (!res.ok || !body.session || !body.tokenHash) {
      const err = body.error ?? "error";
      if (err === "wrong_code" || err === "expired" || err === "too_many_attempts") {
        return { ok: false, reason: err };
      }
      if (err === "no_match" || err === "unknown_reference") {
        return { ok: false, reason: "no_match" };
      }
      return { ok: false, reason: "error" };
    }

    const { error } = await supabase().auth.verifyOtp({
      token_hash: body.tokenHash,
      type: "magiclink",
    });
    if (error) return { ok: false, reason: "error" };

    return {
      ok: true,
      session: {
        taxpayerId: body.session.taxpayerId,
        displayName: body.session.displayName,
        taxpayerType: (body.session.taxpayerType as TaxpayerType) ?? null,
        niu: body.session.niu,
        taxCentre: (body.session.taxCentre as TaxCentre) ?? null,
        taxRegime: (body.session.taxRegime as Regime) ?? null,
        profileVerified: body.session.profileVerified,
        audience,
        signedInAt: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * The portal session for a client who signed in with a password.
 *
 * Two sign-in routes reach the portal, and only one of them was finishing the
 * job. The one-time-code route ends in `verifyPortalCode`, which returns a
 * `PortalSession` the caller stores; the password route only called
 * `auth.signInWithPassword` and navigated. That leaves a real Supabase Auth
 * session with NO `kima.portal.session` behind it -- and `sessionTaxpayerId()`
 * reads exactly that key. So every portal screen asked which taxpayer this was,
 * got null, and rendered its empty or offline branch: requests, documents,
 * payments, messages and the profile all looked permanently static to a client
 * who had in fact signed in correctly. One missing session, six dead screens.
 *
 * The taxpayer is not taken from anything the browser said. It comes from
 * `client_taxpayer_ids()`, the security-definer bridge that reads
 * `contacts.auth_user_id = auth.uid()` -- the same binding every RLS policy
 * uses. A caller who is not bound to a taxpayer gets no rows, and therefore no
 * session, which is the honest answer rather than a signed-in shell with
 * nothing in it.
 *
 * `audience` is derived from the taxpayer's own type, never from which tab the
 * person happened to be on, so an individual cannot land in the business
 * portal by choosing the wrong tab before typing a password.
 */
export async function sessionFromAuthUser(): Promise<PortalSession | null> {
  const db = supabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;

  const { data: bridge, error: bridgeError } = await db.rpc("client_taxpayer_ids");
  const ids = (bridge ?? []) as { taxpayer_id: string }[];
  if (bridgeError || ids.length === 0) return null;

  // More than one file is legitimate -- a person can be the contact for several
  // taxpayers. The first is the landing file; `MyFiles` lists the rest.
  const taxpayerId = ids[0].taxpayer_id;

  const { data: row, error } = await db
    .from("taxpayers")
    .select("id, legal_name, taxpayer_type, niu, tax_centre, tax_regime, profile_verified")
    .eq("id", taxpayerId)
    .maybeSingle();
  if (error || !row) return null;

  const tp = row as {
    id: string;
    legal_name: string | null;
    taxpayer_type: string | null;
    niu: string | null;
    tax_centre: string | null;
    tax_regime: string | null;
    profile_verified: boolean | null;
  };
  const type = (tp.taxpayer_type as TaxpayerType) ?? null;

  return {
    taxpayerId: tp.id,
    displayName: tp.legal_name ?? "",
    taxpayerType: type,
    niu: tp.niu,
    taxCentre: (tp.tax_centre as TaxCentre) ?? null,
    taxRegime: (tp.tax_regime as Regime) ?? null,
    profileVerified: Boolean(tp.profile_verified),
    audience: (type ? taxpayerType(type)?.family : null) ?? "individual",
    signedInAt: new Date().toISOString(),
  };
}

export function audienceMismatch(session: PortalSession): boolean {
  if (!session.taxpayerType) return false;
  const family = taxpayerType(session.taxpayerType)?.family;
  if (!family) return false;
  return family !== session.audience;
}

const KEY = "kima.portal.session";

export function rememberSession(session: PortalSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Non-fatal.
  }
}

export function readSession(): PortalSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalSession;
    return parsed?.taxpayerId ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  try {
    await supabase().auth.signOut();
  } catch {
    // Auth may be unconfigured in some local shells.
  }
}

export const formatTaxNumber = (raw: string | null): string =>
  raw ? normaliseTaxNumber(raw).replace(/(.{4})/g, "$1 ").trim() : "";
