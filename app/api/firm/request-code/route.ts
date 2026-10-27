import { NextResponse } from "next/server";
import { callAuthCodes, edgeAuthConfigured } from "@/lib/auth-codes";
import { deliverOneTimeCode } from "@/lib/auth-mail";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Body = { email?: string; locale?: "fr" | "en" };

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

  const email = (body.email ?? "").trim().toLowerCase();
  const locale = body.locale === "en" ? "en" : "fr";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "incomplete" }, { status: 400 });
  }

  // No service-role key here: the Edge Function holds the privilege instead,
  // and answers in the same shape.
  if (viaEdge) {
    const relayed = await callAuthCodes({ action: "request", audience: "firm", email, locale });
    return NextResponse.json(relayed.body, { status: relayed.status });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("firm_issue_code", { p_email: email });
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
    audience: "firm",
  });

  if (delivery.delivered === "none") {
    return NextResponse.json(
      { error: delivery.reason },
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
