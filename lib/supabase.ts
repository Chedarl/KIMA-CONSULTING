import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * The publishable key is public by design. Every table has RLS enabled, but
 * READ THIS HONESTLY: the demo policies are permissive, not tenant-scoped.
 * Onboarding has to create taxpayers, so anon can read and write the working
 * tables across the whole project. With synthetic data that is vandalism at
 * worst; with real data it would be a breach.
 *
 * This is NOT the production access model. Production requires authenticated
 * users, membership-based tenant scoping and the engagement check in
 * docs/foundation/permissions-matrix.md. Real taxpayer data must never be
 * written to this project (risk R-32).
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
    auth: { persistSession: false },
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
 * The demo tenant: the seeded taxpayer, which is the OLDEST row.
 *
 * Ordering matters now that onboarding creates taxpayers — an unordered
 * limit(1) would bind the client portal to whichever row Postgres returned
 * first, and uploads would land under the wrong tenant.
 */
export async function demoIds(): Promise<{ taxpayerId: string; organizationId: string } | null> {
  const db = supabase();
  const [{ data: tp }, { data: org }] = await Promise.all([
    db.from("taxpayers").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    db.from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle(),
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
