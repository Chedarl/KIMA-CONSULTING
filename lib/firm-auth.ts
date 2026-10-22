/**
 * Firm member sign-in — email + one-time code, then a real Supabase Auth session.
 *
 * Until `firm_members.auth_user_id` is filled, `member_has(...)` is always false
 * and the firm UI cannot write under capability-scoped RLS. This is the door.
 */

import { supabase } from "./supabase";
import type { FirmRole } from "./permissions";

export type FirmSession = {
  memberId: string;
  personLabel: string;
  email: string;
  role: FirmRole;
  signedInAt: string;
};

const KEY = "kima.firm.session";

export type FirmRequestCodeResult =
  | {
      ok: true;
      reference: string | null;
      maskedDestination: string | null;
      demoCode: string | null;
      sent: boolean;
    }
  | { ok: false; reason: "incomplete" | "not_configured" | "error" };

export async function requestFirmCode(
  email: string,
  locale: "fr" | "en",
): Promise<FirmRequestCodeResult> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return { ok: false, reason: "incomplete" };

  try {
    const res = await fetch("/api/firm/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: clean, locale }),
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

export type FirmVerifyResult =
  | { ok: true; session: FirmSession }
  | {
      ok: false;
      reason: "incomplete" | "wrong_code" | "expired" | "too_many_attempts" | "error" | "no_match";
    };

export async function verifyFirmCode(reference: string, code: string): Promise<FirmVerifyResult> {
  const cleanCode = code.replace(/\D/g, "");
  if (!reference || cleanCode.length < 6) return { ok: false, reason: "incomplete" };

  try {
    const res = await fetch("/api/firm/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, code: cleanCode }),
    });
    const body = (await res.json()) as {
      error?: string;
      tokenHash?: string;
      member?: { id: string; personLabel: string; email: string; role: FirmRole };
    };

    if (!res.ok || !body.member || !body.tokenHash) {
      const err = body.error ?? "error";
      if (err === "wrong_code" || err === "expired" || err === "too_many_attempts") {
        return { ok: false, reason: err };
      }
      if (err === "no_match" || err === "unknown_reference" || err === "inactive") {
        return { ok: false, reason: "no_match" };
      }
      return { ok: false, reason: "error" };
    }

    const { error } = await supabase().auth.verifyOtp({
      token_hash: body.tokenHash,
      type: "magiclink",
    });
    if (error) return { ok: false, reason: "error" };

    const session: FirmSession = {
      memberId: body.member.id,
      personLabel: body.member.personLabel,
      email: body.member.email,
      role: body.member.role,
      signedInAt: new Date().toISOString(),
    };
    rememberFirmSession(session);
    return { ok: true, session };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function rememberFirmSession(session: FirmSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Non-fatal.
  }
}

export function readFirmSession(): FirmSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirmSession;
    return parsed?.memberId ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearFirmSession(): Promise<void> {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  try {
    await supabase().auth.signOut();
  } catch {
    // Auth may be unconfigured.
  }
}
