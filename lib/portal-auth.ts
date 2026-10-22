/**
 * Portal sign-in — name plus taxpayer number.
 *
 * Asked for by the owner, 21 October 2026: an individual signs in with their
 * name and their NIU; a business signs in with its business name and its
 * numéro de contribuable. The stated reason is a good one — clients routinely
 * do not know their own taxpayer number, and a sign-in that uses it teaches
 * them where it lives.
 *
 * WHAT THIS IS NOT. The NIU is not a secret.
 *
 * It is printed on tax documents. It is a mandatory mention on every invoice —
 * `lib/document-review.ts` fails a VAT verdict for its absence, which means by
 * design every supplier and every customer holds it. And on the DGI's own
 * Harmony 2 it is the username, not the password.
 *
 * So this pair identifies a taxpayer; it does not authenticate one. Anyone
 * holding one of the client's invoices can sign in as them. That collides with
 * the blueprint's tenant isolation requirement — "a taxpayer cannot reach
 * another taxpayer's files by guessing IDs or URLs" — and the collision is real,
 * not theoretical.
 *
 * It ships because this project holds synthetic data only (supabase/README.md,
 * risk R-32) and because the owner asked for it with a clear purpose. It is
 * recorded in the risk register and must not reach real taxpayer data as it
 * stands.
 *
 * THE UPGRADE THAT KEEPS THE INTENT. The owner's goal is that clients learn
 * their own details. That survives intact if the NIU becomes the identifier and
 * the secret becomes a one-time code sent to the contact address we already
 * collect at onboarding: the client still types their name and number, still
 * learns both, and the number stops being the key. One change, same lesson, no
 * open door.
 */

import { supabase } from "./supabase";
import { taxpayerType, type Regime, type TaxCentre, type TaxpayerType } from "./rules";

/** Which sign-in form the visitor is using. */
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

/**
 * The taxpayer number as written on documents varies: spaces, hyphens, mixed
 * case. Compared stripped and upper-cased, so a client who types it the way
 * their own invoice shows it gets in.
 */
export const normaliseTaxNumber = (raw: string): string =>
  raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const normaliseName = (raw: string): string => raw.trim().replace(/\s+/g, " ");

export type SignInResult =
  | { ok: true; session: PortalSession }
  | { ok: false; reason: "incomplete" | "no_match" | "error" };

/**
 * Looks the taxpayer up through the `portal_sign_in` function, which returns
 * identity fields only and never the client's documents or declarations.
 *
 * Deliberately gives one failure message for "no such name" and "wrong number".
 * Distinguishing them would turn the form into a way to test whether a given
 * business is a client of ours, which is information we do not owe a stranger.
 */
export async function signIn(
  audience: PortalAudience,
  name: string,
  taxNumber: string,
): Promise<SignInResult> {
  const cleanName = normaliseName(name);
  const cleanNumber = normaliseTaxNumber(taxNumber);
  if (!cleanName || !cleanNumber) return { ok: false, reason: "incomplete" };

  try {
    const db = supabase();
    const { data, error } = await db.rpc("portal_sign_in", {
      p_name: cleanName,
      p_identifier: cleanNumber,
    });
    if (error) return { ok: false, reason: "error" };

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: false, reason: "no_match" };

    return {
      ok: true,
      session: {
        taxpayerId: row.id,
        displayName: row.legal_name,
        taxpayerType: (row.taxpayer_type as TaxpayerType) ?? null,
        niu: row.niu ?? null,
        taxCentre: (row.tax_centre as TaxCentre) ?? null,
        taxRegime: (row.tax_regime as Regime) ?? null,
        profileVerified: Boolean(row.profile_verified),
        audience,
        signedInAt: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Does the taxpayer we found match the door they came in through? A business
 * signing in on the individual form is worth saying out loud rather than
 * silently accepting — it usually means they picked the wrong form, and it is
 * the kind of mismatch that otherwise shows up as "the portal looks wrong".
 */
export function audienceMismatch(session: PortalSession): boolean {
  if (!session.taxpayerType) return false;
  const family = taxpayerType(session.taxpayerType)?.family;
  if (!family) return false;
  return family !== session.audience;
}

const KEY = "kima.portal.session";

/**
 * Session storage, not local storage, and the typed number is never kept — only
 * the fact of a successful sign-in and the identity fields the client is
 * entitled to see. Closing the tab ends it.
 *
 * Every accessor is wrapped: storage throws in a private window and in some
 * embedded browsers, and a portal that white-screens because a client has
 * cookies blocked is worse than one that asks them to sign in again.
 */
export function rememberSession(session: PortalSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Non-fatal: the caller holds the session in React state for this page.
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

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/**
 * How the taxpayer number is displayed back to the client. The whole point of
 * the owner's request: they should leave knowing this number. Grouped in fours
 * so it can be read aloud and copied onto a form without losing a digit.
 */
export const formatTaxNumber = (raw: string | null): string =>
  raw ? normaliseTaxNumber(raw).replace(/(.{4})/g, "$1 ").trim() : "";
