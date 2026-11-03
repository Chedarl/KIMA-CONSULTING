import { NextResponse } from "next/server";
import { exportLedgerCsv, importLedger } from "@/lib/dsf-import";

export const runtime = "nodejs";

/**
 * Dry-run a ledger import.
 *
 * It reads the file and reports what it found without writing anything: totals,
 * rows it could not map, rows whose amount is not a whole XAF figure. The chart
 * of accounts is the firm's own, so the mapping is supplied by the caller and
 * an empty mapping is answered honestly ("everything unmapped") rather than
 * with a guessed default.
 */
export async function POST(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A parser endpoint still costs authenticated attention: check the token with
  // the auth service rather than accepting any non-empty string.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const who = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, Authorization: "Bearer " + token } });
  if (!who.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { csv?: string; schedule?: Record<string, string> };
  try {
    body = (await request.json()) as { csv?: string; schedule?: Record<string, string> };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const csv = body.csv ?? "";
  if (csv.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (csv.length > 2_000_000) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const schedule = body.schedule ?? {};
  const result = importLedger(csv, schedule);

  return NextResponse.json({
    ...result,
    export: exportLedgerCsv(result.rows),
    // Echo the first few rows only: the screen renders a preview, not the file.
    rows: result.rows.slice(0, 200),
  });
}
