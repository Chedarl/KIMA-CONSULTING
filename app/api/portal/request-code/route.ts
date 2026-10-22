import { NextResponse } from "next/server";
import { deliverOneTimeCode } from "@/lib/auth-mail";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Body = { name?: string; identifier?: string; locale?: "fr" | "en" };

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

  const name = (body.name ?? "").trim().replace(/\s+/g, " ");
  const identifier = (body.identifier ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const locale = body.locale === "en" ? "en" : "fr";
  if (!name || !identifier) {
    return NextResponse.json({ error: "incomplete" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("portal_issue_code", {
    p_name: name,
    p_identifier: identifier,
  });
  if (error) {
    return NextResponse.json({ error: "issue_failed", detail: error.message.slice(0, 200) }, { status: 502 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ok: boolean;
        masked_destination: string | null;
        reference: string | null;
        code: string | null;
        destination: string | null;
      }
    | undefined;

  // Uniform response when no match — do not reveal whether the NIU exists.
  if (!row?.ok || !row.reference || !row.code || !row.destination) {
    return NextResponse.json({
      ok: true,
      sent: false,
      maskedDestination: null,
      reference: null,
      demoCode: null,
    });
  }

  const delivery = await deliverOneTimeCode({
    to: row.destination,
    code: row.code,
    locale,
    audience: "portal",
  });

  if (delivery.delivered === "none") {
    return NextResponse.json(
      { error: delivery.reason, detail: delivery.detail ?? null },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    sent: delivery.delivered === "email",
    maskedDestination: row.masked_destination,
    reference: row.reference,
    demoCode: delivery.delivered === "demo_reveal" ? delivery.code : null,
  });
}
