import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * The publishable key is public by design; the real boundary is Row Level
 * Security. Every table has RLS on, and the demo policies are scoped to the
 * single seeded demo taxpayer, so this key cannot reach anything else.
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

/* ------------------------------------------------------------------ types */

export type RequestStatusRow =
  | "requested"
  | "in_progress"
  | "in_client_review"
  | "returned"
  | "submitted"
  | "accepted";

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

/** The demo tenant. There is exactly one. */
export async function demoIds(): Promise<{ taxpayerId: string; organizationId: string } | null> {
  const db = supabase();
  const [{ data: tp }, { data: org }] = await Promise.all([
    db.from("taxpayers").select("id").limit(1).maybeSingle(),
    db.from("organizations").select("id").limit(1).maybeSingle(),
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
