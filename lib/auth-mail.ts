/**
 * Deliver a one-time sign-in code.
 *
 * When Resend is configured, the code is emailed and never returned to the
 * browser. When it is not — typical for the synthetic demo before a Kima
 * domain is verified — the caller may reveal the code only if
 * `KIMA_DEMO_OTP_REVEAL=1` is set. That flag is a demo escape hatch, not a
 * production setting.
 */

export type DeliverCodeResult =
  | { delivered: "email"; messageId: string | null }
  | { delivered: "demo_reveal"; code: string }
  | { delivered: "none"; reason: "not_configured" | "send_failed"; detail?: string };

export async function deliverOneTimeCode(input: {
  to: string;
  code: string;
  locale: "fr" | "en";
  audience: "portal" | "firm";
}): Promise<DeliverCodeResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.KIMA_MAIL_FROM ?? "KIMA CONSULTING <onboarding@resend.dev>";
  const reveal = process.env.KIMA_DEMO_OTP_REVEAL === "1";

  if (!apiKey) {
    if (reveal) return { delivered: "demo_reveal", code: input.code };
    return { delivered: "none", reason: "not_configured" };
  }

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

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject, text }),
  });

  if (!send.ok) {
    const detail = (await send.text()).slice(0, 300);
    if (reveal) return { delivered: "demo_reveal", code: input.code };
    return { delivered: "none", reason: "send_failed", detail };
  }

  const sent = (await send.json()) as { id?: string };
  return { delivered: "email", messageId: sent.id ?? null };
}
