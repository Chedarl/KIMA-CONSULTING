export type SuggestionReply = { assigned: boolean; message: string };

/** Interprets one returned row. Anything else is a refusal and assigns nothing. */
export function suggestionReply(
  locale: "fr" | "en",
  error: { message?: string } | null,
  data: unknown,
): SuggestionReply {
  const fr = locale === "fr";
  const row = Array.isArray(data) ? data[0] : null;
  const outcome = row && typeof row === "object" && typeof (row as { outcome?: unknown }).outcome === "string"
    ? (row as { outcome: string }).outcome
    : "";
  const firm = row && typeof row === "object" && typeof (row as { firm_name?: unknown }).firm_name === "string"
    ? (row as { firm_name: string }).firm_name
    : "";
  if (error || !row || (outcome !== "accepted" && outcome !== "declined" && outcome !== "expired")) {
    return {
      assigned: false,
      message: fr ? "Réponse refusée. Aucun cabinet n'a été attribué." : "Reply refused. No firm was assigned.",
    };
  }
  if (outcome === "expired") {
    return {
      assigned: false,
      message: fr ? "Cette proposition a expiré. Aucun cabinet n'a été attribué." : "This suggestion has expired. No firm was assigned.",
    };
  }
  if (outcome === "declined") {
    return {
      assigned: false,
      message: fr ? "Proposition refusée. Votre demande reste sans cabinet." : "Suggestion declined. Your application stays without a firm.",
    };
  }
  return {
    assigned: true,
    message: fr
      ? `${firm} est le cabinet nommé. L'engagement reste à accepter.`
      : `${firm} is the firm named. The engagement still has to be accepted.`,
  };
}
