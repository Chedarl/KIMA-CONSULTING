import { NextResponse } from "next/server";
import { mintAuthSession, isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Body = { reference?: string; code?: string };

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const reference = body.reference ?? "";
  const code = (body.code ?? "").replace(/\D/g, "");
  if (!/^[0-9a-f-]{36}$/i.test(reference) || code.length < 6) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("firm_verify_code", {
    p_reference: reference,
    p_code: code,
  });
  if (error) {
    return NextResponse.json({ error: "verify_failed" }, { status: 502 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ok: boolean;
        reason: string | null;
        member_id: string | null;
        person_label: string | null;
        email: string | null;
        role: string | null;
      }
    | undefined;

  if (!row?.ok || !row.member_id || !row.email || !row.person_label || !row.role) {
    return NextResponse.json(
      { error: row?.reason ?? "no_match" },
      { status: row?.reason === "wrong_code" ? 401 : 422 },
    );
  }

  const minted = await mintAuthSession(row.email);
  if (!minted.ok) {
    return NextResponse.json({ error: "session_failed", detail: minted.reason }, { status: 502 });
  }

  await db.from("firm_members").update({ auth_user_id: minted.userId }).eq("id", row.member_id);

  return NextResponse.json({
    ok: true,
    tokenHash: minted.tokenHash,
    member: {
      id: row.member_id,
      personLabel: row.person_label,
      email: row.email,
      role: row.role,
    },
  });
}
