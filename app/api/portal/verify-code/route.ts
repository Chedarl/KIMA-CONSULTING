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

  let tokenHash: string | null = null;
  if (row.contact_email) {
    const minted = await mintAuthSession(row.contact_email);
    if (minted.ok) {
      tokenHash = minted.tokenHash;
      if (row.contact_id) {
        await db.from("contacts").update({ auth_user_id: minted.userId }).eq("id", row.contact_id);
      }
    }
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
