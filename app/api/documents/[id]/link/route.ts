import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** The bucket every document row points into. */
const BUCKET = "kima-demo";
/** Long enough to open a tab, short enough that a copied link dies. */
const TTL_SECONDS = 120;

/**
 * Issue a short-lived download link for one document.
 *
 * The caller's own access token is used, never the service role, so RLS decides
 * whether the document exists for this person at all — a firm's internal file
 * is invisible to the client's session before any URL is minted. Every issued
 * link is recorded in document_access_log, which is the audit trail the archive
 * claims to have.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const db = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: doc, error } = await db
    .from("documents")
    .select("id, storage_path")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    // A rejected token is an authentication answer, not a bad gateway.
    const denied = /jwt|permission|row-level/i.test(error.message);
    return NextResponse.json({ error: denied ? "unauthorized" : "lookup_failed" }, { status: denied ? 401 : 502 });
  }
  if (!doc || !doc.storage_path) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: signed, error: signError } = await db.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "link_failed" }, { status: 502 });
  }

  // The log is append-only from any client key; a failure here must not hand
  // back a working link that nothing records.
  const { error: logError } = await db
    .from("document_access_log")
    .insert({ document_id: doc.id, action: "link_issued" });

  if (logError) return NextResponse.json({ error: "audit_unavailable" }, { status: 503 });

  return NextResponse.json({
    url: signed.signedUrl,
    expires_in: TTL_SECONDS,
  });
}
