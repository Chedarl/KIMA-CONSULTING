import { ask, type ClarityAnswer } from "@/lib/clarity";
import { kimaCorpus } from "@/lib/assistant/corpus";

export type CopilotAnswer = ClarityAnswer & { generated?: boolean };

export async function answerCopilot(question: string, locale: "fr" | "en"): Promise<CopilotAnswer> {
  const base = ask(question, kimaCorpus, locale);
  if (base.kind === "refusal") return base;
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return base;
  const source = kimaCorpus.find((s) => s.id === base.sourceId);
  if (!source) return base;
  const lang = locale === "fr" ? "français" : "English";
  const sys = "You answer strictly from the source provided. If it does not answer the question, say so and refuse. Never invent a tax rule, never present a DGI integration, and always repeat the citation verbatim. Reply in " + lang + ". Under 90 words.";
  const user = "Question: " + question + "\n\nSource (citation: " + source.citation + "):\n" + source.body;
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify({ model: "deepseek-chat", temperature: 0, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }) });
    if (!res.ok) return base;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text || !text.includes(source.citation)) return base;
    return { ...base, text: text + "\n\n" + (locale === "fr" ? "Source : " : "Source: ") + source.citation, generated: true };
  } catch { return base; }
}
