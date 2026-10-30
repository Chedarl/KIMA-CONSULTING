import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AcceptanceRecord } from "./document-review";

/**
 * Browser Supabase client.
 *
 * The publishable key is public by design. RLS is the boundary:
 * - With a real Auth session, `can_see_taxpayer` / `member_has` scope access.
 * - The temporary anon demo branch only runs when Postgres
 *   `app.allow_demo_anon = on` (default off after the auth-closeout migration).
 *
 * Real taxpayer data must never be written while the demo branch is enabled
 * (risk R-32).
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  client = createClient(url, key, {
    // Persist Auth so RLS can see auth.uid() after portal/firm OTP verify.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

export const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

import type { RequestStatus } from "./cases";

/* ------------------------------------------------------------------ types */

// One vocabulary. The row type is the engine's type; a redeclared union here
// would let the database and the engine disagree about what a status is.
export type RequestStatusRow = RequestStatus;

export type DocumentRequestRow = {
  id: string;
  taxpayer_id: string;
  organization_id: string;
  case_id?: string | null;
  label_fr: string;
  label_en: string;
  status: RequestStatusRow;
  responsible: "taxpayer" | "firm";
  due_on: string;
  returned_count: number;
  reason_fr: string | null;
  reason_en: string | null;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  request_id: string | null;
  taxpayer_id: string;
  file_name: string;
  storage_path: string | null;
  byte_size: number | null;
  mime_type: string | null;
  uploaded_by: "taxpayer" | "firm";
  arrived_via: string;
  review_status: string;
  /** Facts and the three verdicts. Absent until a practitioner records them. */
  acceptance?: AcceptanceRecord | null;
  created_at: string;
};

export type ActivityRow = {
  id: string;
  taxpayer_id: string;
  actor: "taxpayer" | "firm";
  text_fr: string;
  text_en: string;
  occurred_at: string;
};

/**
 * Resolve the portal taxpayer and its one unambiguous authorized firm.
 *
 * An absent or invalid Auth session must never be replaced with a seeded
 * identity. If several firms are engaged, the UI must ask which firm to
 * contact rather than arbitrarily selecting one.
 */
export type PortalContext =
  | { status: "ready"; taxpayerId: string; organizationId: string }
  | { status: "multiple_firms" | "no_firm" | "no_session" | "unavailable" };

/** Distinguish an ambiguous firm relationship from a network or auth failure. */
export async function resolvePortalContext(): Promise<PortalContext> {
  const taxpayerId = await sessionTaxpayerId();
  if (!taxpayerId) return { status: "no_session" };

  const { data, error } = await supabase()
    .from("engagements")
    .select("organization_id")
    .eq("taxpayer_id", taxpayerId)
    .in("status", ["accepted", "authorized"])
    .is("revoked_at", null);
  if (error || !data) return { status: "unavailable" };

  const organizationIds = [...new Set(
    data.map((engagement) => engagement.organization_id as string | null).filter(
      (id): id is string => Boolean(id),
    ),
  )];
  if (organizationIds.length > 1) return { status: "multiple_firms" };
  if (organizationIds.length === 0) return { status: "no_firm" };
  return { status: "ready", taxpayerId, organizationId: organizationIds[0] };
}

export async function demoIds(): Promise<{ taxpayerId: string; organizationId: string } | null> {
  const context = await resolvePortalContext();
  return context.status === "ready"
    ? { taxpayerId: context.taxpayerId, organizationId: context.organizationId }
    : null;
}

/**
 * A portal write or read may use only the taxpayer from a current authenticated
 * session whose record is visible through database row-level security.
 * Session storage alone is never evidence of authorization.
 */
export async function sessionTaxpayerId(): Promise<string | null> {
  let taxpayerId: string | null = null;
  try {
    const raw = sessionStorage.getItem("kima.portal.session");
    if (raw) taxpayerId = (JSON.parse(raw) as { taxpayerId?: string }).taxpayerId ?? null;
  } catch {
    return null;
  }
  if (!taxpayerId) return null;

  const db = supabase();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) return null;

  const { data: taxpayer, error } = await db
    .from("taxpayers")
    .select("id")
    .eq("id", taxpayerId)
    .maybeSingle();
  return !error && taxpayer?.id === taxpayerId ? taxpayerId : null;
}

/** Append-only. Written on every state change a user can see. */
export async function audit(entry: {
  taxpayerId: string;
  organizationId?: string;
  actor: "taxpayer" | "firm";
  actorMemberId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase()
    .from("audit_events")
    .insert({
      taxpayer_id: entry.taxpayerId,
      organization_id: entry.organizationId ?? null,
      actor: entry.actor,
      actor_member_id: entry.actorMemberId ?? null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  return error ? { ok: false, error: error.message } : { ok: true };
}
