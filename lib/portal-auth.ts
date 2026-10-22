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

    if (!res.ok || !body.session) {
      const err = body.error ?? "error";
      if (err === "wrong_code" || err === "expired" || err === "too_many_attempts") {
        return { ok: false, reason: err };
      }
      if (err === "no_match" || err === "unknown_reference") {
        return { ok: false, reason: "no_match" };
      }
      return { ok: false, reason: "error" };
    }

    if (body.tokenHash) {
      const { error } = await supabase().auth.verifyOtp({
        token_hash: body.tokenHash,
        type: "magiclink",
      });
      if (error) return { ok: false, reason: "error" };
    }

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
