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
  // and returns the same `session` shape this route builds below.
  if (viaEdge) {
    const relayed = await callAuthCodes({
      action: "verify",
      audience: "portal",
      reference,
      code,
    });
    return NextResponse.json(relayed.body, { status: relayed.status });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("portal_verify_code", {
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
        taxpayer_id: string | null;
        display_name: string | null;
        contact_id: string | null;
        contact_email: string | null;
      }
    | undefined;

  if (!row?.ok || !row.taxpayer_id || !row.display_name) {
    return NextResponse.json(
      { error: row?.reason ?? "no_match" },
      { status: row?.reason === "wrong_code" ? 401 : 422 },
    );
  }

  const { data: tp, error: tpErr } = await db
    .from("taxpayers")
    .select("id, legal_name, taxpayer_type, niu, tax_centre, tax_regime, profile_verified")
    .eq("id", row.taxpayer_id)
    .maybeSingle();
  if (tpErr || !tp) {
    return NextResponse.json({ error: "taxpayer_missing" }, { status: 500 });
  }

  // A sign-in is a session bound to this client's contact. Without both, the
  // browser would hold a "signed-in" screen that every policy then refuses, so
  // say it failed instead of answering ok.
  if (!row.contact_email || !row.contact_id) {
    return NextResponse.json({ error: "no_destination" }, { status: 422 });
  }

  const minted = await mintAuthSession(row.contact_email);
  if (!minted.ok) {
    return NextResponse.json({ error: "session_failed" }, { status: 502 });
  }
  const tokenHash = minted.tokenHash;

  // The binding is what makes client_taxpayer_ids() answer for this session.
  // It can be refused (auth_identity_is_single: the sign-in already belongs to
  // a firm member) or match no row; either way the sign-in has not happened.
  const { data: bound, error: bindErr } = await db
    .from("contacts")
    .update({ auth_user_id: minted.userId })
    .eq("id", row.contact_id)
    .select("id");
  if (bindErr || !bound || bound.length !== 1) {
    return NextResponse.json({ error: "binding_failed" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    tokenHash,
    session: {
      taxpayerId: tp.id as string,
      displayName: (tp.legal_name as string) ?? row.display_name,
      taxpayerType: (tp.taxpayer_type as string | null) ?? null,
      niu: (tp.niu as string | null) ?? null,
      taxCentre: (tp.tax_centre as string | null) ?? null,
      taxRegime: (tp.tax_regime as string | null) ?? null,
      profileVerified: Boolean(tp.profile_verified),
    },
  });
}
