import { NextResponse } from "next/server";
import { callAuthCodes, edgeAuthConfigured } from "@/lib/auth-codes";
import { mintAuthSession, isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Body = { reference?: string; code?: string };

export async function POST(request: Request) {
  const viaEdge = !isSupabaseAdminConfigured();
  if (viaEdge && !edgeAuthConfigured()) {
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

  // No service-role key here: the Edge Function holds the privilege instead,
  // and answers in the same shape.
  if (viaEdge) {
    const relayed = await callAuthCodes({ action: "verify", audience: "firm", reference, code });
    return NextResponse.json(relayed.body, { status: relayed.status });
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
    return NextResponse.json({ error: "session_failed" }, { status: 502 });
  }

  // The binding is what makes member_has() answer for this session. It can be
  // refused (auth_identity_is_single: the sign-in already belongs to a client)
  // or match no row; either way the sign-in has not happened.
  const { data: bound, error: bindErr } = await db
    .from("firm_members")
    .update({ auth_user_id: minted.userId })
    .eq("id", row.member_id)
    .select("id");
  if (bindErr || !bound || bound.length !== 1) {
    return NextResponse.json({ error: "binding_failed" }, { status: 409 });
  }

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
