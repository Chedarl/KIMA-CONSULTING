import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Preview-only demo entry.
 *
 * Production has no way for a human to obtain a firm session: firm sign-up is
 * off, the demo flags are off, and the synthetic accounts sit on undeliverable
 * addresses. That is the intended production posture, but it also means nobody
 * can see the workspace on a deployed preview.
 *
 * This returns a one-time sign-in link for a synthetic firm member, and only
 * when KIMA_DEMO_ENTRY=1 and the deployment is not production. In production it
 * answers 404 whatever the flag says, so the door cannot be opened by an
 * environment variable alone.
 */
export async function POST(request: Request) {
  const allowed = process.env.KIMA_DEMO_ENTRY === "1" && process.env.VERCEL_ENV !== "production";
  if (!allowed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const email = process.env.KIMA_DEMO_EMAIL ?? "irina@demo.kima.cm";

  // Land on the workspace, not the marketing page: a session that arrives on
  // /fr leaves the visitor looking at the same home page they started on, which
  // is exactly the "nothing changed" impression this entry exists to fix.
  let redirectTo: string | undefined;
  try {
    const body = (await request.json()) as { locale?: string };
    const locale = body.locale === "en" ? "en" : "fr";
    const origin = new URL(request.url).origin;
    redirectTo = origin + "/" + locale + "/workspace";
  } catch {
    redirectTo = undefined;
  }

  const { data, error } = await supabaseAdmin().auth.admin.generateLink({
    type: "magiclink",
    email,
    ...(redirectTo ? { options: { redirectTo } } : {}),
  });
  const url = data?.properties?.action_link;
  if (error || !url) return NextResponse.json({ error: "failed" }, { status: 502 });

  return NextResponse.json({ url });
}
