import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
 * Resolve the active taxpayer / organisation for client surfaces.
 *
 * Prefer the portal session's taxpayer. Fall back to the oldest seeded row only
 * when the demo anon branch is still enabled — never invent a cross-tenant bind.
 */
export async function demoIds(): Promise<{ taxpayerId: string; organizationId: string } | null> {
  const db = supabase();

  let sessionTaxpayerId: string | null = null;
  try {
    const raw = sessionStorage.getItem("kima.portal.session");
    if (raw) {
      const parsed = JSON.parse(raw) as { taxpayerId?: string };
      sessionTaxpayerId = parsed.taxpayerId ?? null;
    }
  } catch {
    sessionTaxpayerId = null;
  }

  const orgQuery = db
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (sessionTaxpayerId) {
    const [{ data: tp }, { data: org }] = await Promise.all([
      db.from("taxpayers").select("id").eq("id", sessionTaxpayerId).maybeSingle(),
      orgQuery,
    ]);
    if (tp?.id && org?.id) {
      return { taxpayerId: tp.id as string, organizationId: org.id as string };
    }
  }

  const [{ data: tp }, { data: org }] = await Promise.all([
    db.from("taxpayers").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    orgQuery,
  ]);
  if (!tp?.id || !org?.id) return null;
  return { taxpayerId: tp.id as string, organizationId: org.id as string };
}

/** Append-only. Written on every state change a user can see. */
export async function audit(entry: {
  taxpayerId: string;
  organizationId?: string;
  actor: "taxpayer" | "firm";
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
}) {
  await supabase()
    .from("audit_events")
    .insert({
      taxpayer_id: entry.taxpayerId,
      organization_id: entry.organizationId ?? null,
      actor: entry.actor,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
}
