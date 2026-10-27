/**
 * Deliver a one-time sign-in code.
 *
 * When Resend is configured, the code is emailed and never returned to the
 * browser. A code is shown on screen only when ALL of these hold
 * (`mayRevealCode`):
 *
 * - the operator set `KIMA_DEMO_OTP_REVEAL=1`;
 * - this is not the production deployment (`VERCEL_ENV !== "production"`);
 * - the address cannot receive mail at all: `demo.kima.cm`, or a domain that
 *   starts with `example.` (reserved by IANA for exactly this).
 *
 * A real address goes through email or not at all. In particular a failed send
 * to a real address is a failure, never a reason to show the code — that would
 * let anyone who knows a name and NIU sign in as that taxpayer.
 *
 * The `auth-codes` Edge Function (supabase/functions/auth-codes/index.ts)
 * applies the same address rule.
 */

export type DeliverCodeResult =
  | { delivered: "email"; messageId: string | null }
  | { delivered: "demo_reveal"; code: string }
  | { delivered: "none"; reason: "not_configured" | "send_failed" };

/** A destination that cannot receive mail, so showing its code exposes nobody. */
export function isUndeliverableAddress(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain === "demo.kima.cm" || domain.startsWith("example.");
}

/**
 * The single rule for showing a code on screen. Pure, so the engine check can
 * pin it (T-18).
 */
export function mayRevealCode(input: {
  revealFlag: string | undefined;
  vercelEnv: string | undefined;
  destination: string;
}): boolean {
  return (
    input.revealFlag === "1" &&
    input.vercelEnv !== "production" &&
    isUndeliverableAddress(input.destination)
  );
}

export async function deliverOneTimeCode(input: {
  to: string;
  code: string;
  locale: "fr" | "en";
  audience: "portal" | "firm";
}): Promise<DeliverCodeResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.KIMA_MAIL_FROM ?? "KIMA CONSULTING <onboarding@resend.dev>";
  const reveal = mayRevealCode({
    revealFlag: process.env.KIMA_DEMO_OTP_REVEAL,
    vercelEnv: process.env.VERCEL_ENV,
    destination: input.to,
  });

  // An undeliverable demo address: sending would only bounce.
  if (reveal) return { delivered: "demo_reveal", code: input.code };

  if (!apiKey) return { delivered: "none", reason: "not_configured" };

  const fr = input.locale === "fr";
  const subject =
    input.audience === "firm"
      ? fr
        ? "KIMA OS — votre code d'accès cabinet"
        : "KIMA OS — your firm access code"
      : fr
        ? "KIMA OS — votre code d'accès"
        : "KIMA OS — your access code";

  const text = [
    fr ? "Bonjour," : "Hello,",
    "",
    fr
      ? `Votre code à usage unique est : ${input.code}`
      : `Your one-time code is: ${input.code}`,
    "",
    fr
      ? "Il expire dans dix minutes et ne peut être utilisé qu'une fois."
      : "It expires in ten minutes and can be used only once.",
    "",
    "— KIMA CONSULTING",
    "",
    fr
      ? "Message de démonstration. Aucune intégration DGI n'est établie."
      : "Demonstration message. No DGI integration is established.",
  ].join("\n");

  let send: Response;
  try {
    send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject, text }),
    });
  } catch {
    return { delivered: "none", reason: "send_failed" };
  }

  // A real address whose send failed: report the failure. Never reveal.
  if (!send.ok) {
    console.error("auth-mail: send failed", send.status, (await send.text()).slice(0, 300));
    return { delivered: "none", reason: "send_failed" };
  }

  const sent = (await send.json()) as { id?: string };
  return { delivered: "email", messageId: sent.id ?? null };
}
