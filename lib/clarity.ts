/**
 * Kima Clarity AI — the constrained part.
 *
 * The product rule is that the assistant never invents a tax rule, never
 * presents its output as a DGI determination, and answers only from sources
 * that carry provenance. This module therefore does no generation at all: it
 * selects the best-matching verified source and quotes it, or it refuses. A
 * source that has not been verified is named and refused rather than used.
 */

export type ClaritySource = {
  id: string;
  /** Where it comes from, printed with the answer. */
  citation: string;
  title: string;
  body: string;
  /** English-localised rendering; falls back to `title`/`body` when absent. */
  title_en?: string;
  body_en?: string;
  /** Only a verified source may support an answer. */
  verified: boolean;
  /** Lower-cased terms that should match a question about this source. */
  terms: string[];
};

export type ClarityAnswer = {
  kind: "answer" | "refusal";
  /** Rendered text, built from the source — never free composition. */
  text: string;
  /** The source relied on, or the unverified one that blocked an answer. */
  sourceId: string | null;
  reason: "matched" | "unverified" | "no_match";
};

export function normalise(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function score(question: string, terms: string[]): number {
  const words = new Set(normalise(question).split(" ").filter((w) => w.length > 2));
  let hits = 0;
  for (const term of terms) {
    for (const piece of normalise(term).split(" ")) {
      if (piece.length > 2 && words.has(piece)) { hits++; break; }
    }
  }
  return hits;
}

/**
 * Answer from verified sources only.
 *
 * The threshold is deliberately high: with three matching terms required, a
 * vague question gets a refusal rather than a confident miss. A refusal always
 * names what is missing, so the reader knows whether to look further or to ask
 * their tax centre.
 */
export function ask(
  question: string,
  sources: ClaritySource[],
  locale: "fr" | "en",
): ClarityAnswer {
  const ranked = sources
    .map((source) => ({ source, hits: score(question, source.terms) }))
    .sort((a, b) => b.hits - a.hits);

  const best = ranked[0];
  const MIN_HITS = 2;

  if (!best || best.hits < MIN_HITS) {
    return {
      kind: "refusal",
      text: locale === "fr"
        ? "Je n'ai pas de source vérifiée pour répondre à cette question. Demandez à votre centre des impôts avant d'agir."
        : "I have no verified source to answer that. Ask your tax centre before acting.",
      sourceId: null,
      reason: "no_match",
    };
  }

  if (!best.source.verified) {
    return {
      kind: "refusal",
      text: locale === "fr"
        ? `La règle « ${best.source.title} » n'est pas encore vérifiée : elle ne peut pas fonder une réponse. Source à confirmer : ${best.source.citation}.`
        : `The rule "${best.source.title_en ?? best.source.title}" is not verified yet, so it cannot support an answer. Source still to confirm: ${best.source.citation}.`,
      sourceId: best.source.id,
      reason: "unverified",
    };
  }

  return {
    kind: "answer",
    text: (locale === "en" ? (best.source.body_en ?? best.source.body) : best.source.body) + "\n\n" + (locale === "fr" ? "Source : " : "Source: ") + best.source.citation,
    sourceId: best.source.id,
    reason: "matched",
  };
}
