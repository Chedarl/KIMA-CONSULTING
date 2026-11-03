/**
 * Firm member sign-in — email + one-time code, then a real Supabase Auth session.
 *
 * Until `firm_members.auth_user_id` is filled, `member_has(...)` is always false
 * and the firm UI cannot write under capability-scoped RLS. This is the door.
 */

import { supabase } from "./supabase";
import type { FirmMember, FirmRole } from "./permissions";

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
    notifyFirmSession();
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

const SESSION_EVENT = "kima-firm-session";

function notifyFirmSession(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

/** The member the OTP flow recorded. The roster wins when it has loaded. */
export function memberFromSession(session: FirmSession): FirmMember {
  return {
    id: session.memberId,
    person_label: session.personLabel,
    email: session.email,
    role: session.role,
    active: true,
    deactivated_at: null,
  };
}

export function subscribeFirmSession(
  onChange: (session: FirmSession | null) => void,
): () => void {
  const sync = () => onChange(readFirmSession());
  sync();
  window.addEventListener(SESSION_EVENT, sync);
  return () => window.removeEventListener(SESSION_EVENT, sync);
}

export async function clearFirmSession(): Promise<void> {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  notifyFirmSession();
  try {
    await supabase().auth.signOut();
  } catch {
    // Auth may be unconfigured.
  }
}

/**
 * Adopt an existing Supabase session as a firm session.
 *
 * The OTP flow normally writes the firm session itself, but a magic link, a
 * refreshed tab or a second device produces a valid Supabase session with no
 * record in sessionStorage — and the bar would then tell a signed-in partner
 * they were not connected while their own dashboard rendered their clients.
 * This resolves the member from `firm_members.auth_user_id`, which is the same
 * binding every RLS policy reads, and remembers it under the existing key.
 *
 * `firm_members.email` is deliberately not selected: the column grants withhold
 * it from authenticated callers, so the address comes from the auth user.
 */
export async function hydrateFirmSession(): Promise<FirmSession | null> {
  const existing = readFirmSession();
  if (existing) return existing;

  try {
    const client = supabase();
    const { data: auth } = await client.auth.getUser();
    const user = auth?.user;
    if (!user) return null;

    // The table cannot answer this: auth_user_id is withheld from authenticated
    // callers and Postgres requires the privilege for a column in a WHERE.
    const { data: rows } = await client.rpc("current_firm_member");
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;

    const session: FirmSession = {
      memberId: row.id,
      personLabel: row.person_label,
      email: user.email ?? "",
      role: row.role as FirmRole,
      signedInAt: new Date().toISOString(),
    };
    rememberFirmSession(session);
    return session;
  } catch {
    return null;
  }
}
