import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Outbound document inquiry.
 *
 * Requires a firm Auth bearer token. The recipient is always read from the
 * database for the authorised taxpayer — never an arbitrary address.
 */
export const runtime = "nodejs";

type Body = { taxpayerId?: string; locale?: "fr" | "en"; note?: string };

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.KIMA_MAIL_FROM ?? "KIMA CONSULTING <onboarding@resend.dev>";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!apiKey || !supabaseUrl || !anonKey || !isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: firmAllowed } = await userClient.rpc("member_has", { cap: "note.write_client" });
  if (!firmAllowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { taxpayerId, locale = "fr", note } = body;
  if (!taxpayerId || !/^[0-9a-f-]{36}$/i.test(taxpayerId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (note && note.length > 2000) {
    return NextResponse.json({ error: "note_too_long" }, { status: 400 });
  }

  const { data: canSee } = await userClient.rpc("can_see_taxpayer", { tp: taxpayerId });
  if (!canSee) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { data: taxpayers, error: tpErr } = await admin
    .from("taxpayers")
    .select("legal_name, contact_name, contact_email")
    .eq("id", taxpayerId)
    .limit(1);
  if (tpErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
  const taxpayer = taxpayers?.[0] as
    | { legal_name: string; contact_name: string | null; contact_email: string | null }
    | undefined;
  if (!taxpayer?.contact_email) {
    return NextResponse.json({ error: "no_contact_email" }, { status: 422 });
  }

  const { data: outstanding } = await admin
    .from("document_requests")
    .select("label_fr, label_en, reason_fr, reason_en, due_on")
    .eq("taxpayer_id", taxpayerId)
    .in("status", ["requested", "returned", "in_progress", "in_client_review"])
    .order("due_on");

  if (!outstanding || outstanding.length === 0) {
    return NextResponse.json({ error: "nothing_outstanding" }, { status: 422 });
  }

  const fr = locale === "fr";
  const safeNote = note ? note.replace(/[\r\n]+/g, " ").slice(0, 2000) : "";
  const items = outstanding
    .map((r) => {
      const label = fr ? r.label_fr : r.label_en;
      const why = fr ? r.reason_fr : r.reason_en;
      return `• ${label} (${fr ? "échéance" : "due"} ${r.due_on})${why ? `\n   ${why}` : ""}`;
    })
    .join("\n");

  const subject = fr
    ? `KIMA OS — pièces encore attendues pour ${taxpayer.legal_name}`
    : `KIMA OS — documents still needed for ${taxpayer.legal_name}`;

  const text = [
    `${fr ? "Bonjour" : "Hello"} ${taxpayer.contact_name ?? ""}`.trim() + ",",
    "",
    fr
      ? "Pour continuer la préparation de votre déclaration, il nous manque :"
      : "To continue preparing your declaration, we still need:",
    "",
    items,
    "",
    safeNote ? `${safeNote}\n` : "",
    fr
      ? "Vous pouvez les déposer directement dans votre espace KIMA OS."
      : "You can upload them directly in your KIMA OS portal.",
    "",
    "— KIMA CONSULTING",
    "",
    fr
      ? "Message de démonstration. Aucune valeur fiscale n'est calculée et aucune intégration DGI n'est établie."
      : "Demonstration message. No tax values are computed and no DGI integration is established.",
  ]
    .filter(Boolean)
    .join("\n");

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [taxpayer.contact_email], subject, text }),
  });

  if (!send.ok) {
    const detail = (await send.text()).slice(0, 300);
    return NextResponse.json({ error: "send_failed", detail }, { status: 502 });
  }

  const sent = (await send.json()) as { id?: string };

  await admin.from("case_events").insert({
    case_id: null,
    taxpayer_id: taxpayerId,
    dimension: "note",
    kind: "note_added",
    actor_role: "firm_staff",
    actor_label: "Firm",
    from_value: null,
    to_value: null,
    subject_ref: null,
    reason: fr
      ? `Kima vous a écrit au sujet de ${outstanding.length} pièce(s) manquante(s).`
      : `Kima emailed you about ${outstanding.length} missing document(s).`,
    visibility: "client",
  });

  return NextResponse.json({ ok: true, id: sent.id ?? null, count: outstanding.length });
}
