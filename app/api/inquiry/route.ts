import { NextResponse } from "next/server";

/**
 * Outbound document inquiry.
 *
 * Runs on the server because the Resend key must never reach the browser.
 * The caller supplies a taxpayer id, not an address: the recipient is read
 * from the database, so this endpoint cannot be used to mail an arbitrary
 * address. That matters — an open "email anyone" endpoint on a public site is
 * a spam relay.
 *
 * DELIVERY LIMIT: the sender is `onboarding@resend.dev` until a Kima domain is
 * verified in Resend, and that sender only delivers to the Resend account
 * owner's own address. Mail to a client address will be accepted by the API
 * and never arrive. Verifying a Kima domain lifts this.
 */
export const runtime = "nodejs";

type Body = { taxpayerId?: string; locale?: "fr" | "en"; note?: string };

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.KIMA_MAIL_FROM ?? "Kima Consulting <onboarding@resend.dev>";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
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

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  const tpRes = await fetch(
    `${supabaseUrl}/rest/v1/taxpayers?id=eq.${taxpayerId}&select=legal_name,contact_name,contact_email`,
    { headers, cache: "no-store" },
  );
  const taxpayers = (await tpRes.json()) as {
    legal_name: string;
    contact_name: string | null;
    contact_email: string | null;
  }[];
  const taxpayer = taxpayers?.[0];
  if (!taxpayer?.contact_email) {
    return NextResponse.json({ error: "no_contact_email" }, { status: 422 });
  }

  const reqRes = await fetch(
    `${supabaseUrl}/rest/v1/document_requests?taxpayer_id=eq.${taxpayerId}` +
      `&status=in.(requested,returned,in_progress,in_client_review)` +
      `&select=label_fr,label_en,reason_fr,reason_en,due_on&order=due_on`,
    { headers, cache: "no-store" },
  );
  const outstanding = (await reqRes.json()) as {
    label_fr: string;
    label_en: string;
    reason_fr: string | null;
    reason_en: string | null;
    due_on: string;
  }[];

  if (!outstanding || outstanding.length === 0) {
    return NextResponse.json({ error: "nothing_outstanding" }, { status: 422 });
  }

  const fr = locale === "fr";
  const items = outstanding
    .map((r) => {
      const label = fr ? r.label_fr : r.label_en;
      const why = fr ? r.reason_fr : r.reason_en;
      return `• ${label} (${fr ? "échéance" : "due"} ${r.due_on})${why ? `\n   ${why}` : ""}`;
    })
    .join("\n");

  const subject = fr
    ? `Kima — pièces encore attendues pour ${taxpayer.legal_name}`
    : `Kima — documents still needed for ${taxpayer.legal_name}`;

  const text = [
    `${fr ? "Bonjour" : "Hello"} ${taxpayer.contact_name ?? ""}`.trim() + ",",
    "",
    fr
      ? "Pour continuer la préparation de votre déclaration, il nous manque :"
      : "To continue preparing your declaration, we still need:",
    "",
    items,
    "",
    note ? `${note}\n` : "",
    fr
      ? "Vous pouvez les déposer directement dans votre espace Kima."
      : "You can upload them directly in your Kima portal.",
    "",
    "— Kima Consulting",
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
    // Surface Resend's own reason — most often the resend.dev sender
    // restriction — without leaking the key or the raw response.
    const detail = (await send.text()).slice(0, 300);
    return NextResponse.json({ error: "send_failed", detail }, { status: 502 });
  }

  const sent = (await send.json()) as { id?: string };

  await fetch(`${supabaseUrl}/rest/v1/activity_events`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      taxpayer_id: taxpayerId,
      actor: "firm",
      text_fr: `Kima vous a écrit au sujet de ${outstanding.length} pièce(s) manquante(s).`,
      text_en: `Kima emailed you about ${outstanding.length} missing document(s).`,
    }),
  });

  return NextResponse.json({ ok: true, id: sent.id ?? null, count: outstanding.length });
}
