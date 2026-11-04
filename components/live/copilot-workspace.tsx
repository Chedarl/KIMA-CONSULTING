"use client";

import { useRef, useState } from "react";
import { PageHeading } from "@/components/ui";

type C = { [k: string]: string };
type Answer = { kind: string; text: string; sourceId?: string | null };
type Turn = { q: string; a: Answer | null; busy: boolean };

export function CopilotWorkspace({ locale, t }: { locale: "fr" | "en"; t: C }) {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = [t.s1, t.s2, t.s3, t.s4].filter(Boolean);

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setQ("");
    const idx = turns.length;
    setTurns((cur) => [...cur, { q: text, a: null, busy: true }]);
    try {
      const res = await fetch("/api/assistant/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, locale }) });
      const a = (await res.json()) as Answer;
      setTurns((cur) => cur.map((x, i) => (i === idx ? { ...x, a, busy: false } : x)));
    } catch {
      setTurns((cur) => cur.map((x, i) => (i === idx ? { ...x, a: { kind: "refusal", text: t.unavailable }, busy: false } : x)));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t.title} lede={t.lede} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-fg-muted">{t.context}</span>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-fg-muted">{t.boundary}</span>
      </div>

      <section className="rounded-card border border-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.suggestionsTitle}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => void ask(s)} className="min-h-[40px] rounded-full border border-border bg-surface px-3 text-sm text-fg hover:border-teal/40 hover:bg-surface-sunken">{s}</button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        {turns.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface p-6 text-sm text-fg-muted">{t.empty}</p>
        ) : null}
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#18243B] px-4 py-2 text-sm text-white">{turn.q}</p>
            {turn.busy ? (
              <p className="mr-auto text-sm text-fg-subtle">{t.thinking}</p>
            ) : turn.a ? (
              <div className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3">
                <p className="whitespace-pre-wrap text-sm text-fg">{turn.a.text}</p>
                {turn.a.kind === "answer" && turn.a.sourceId ? (
                  <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold text-teal-text">{t.cited}</p>
                ) : null}
                {turn.a.kind === "refusal" ? (
                  <p className="mt-2 text-[11px] text-amber-text">{t.refused}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="sticky bottom-4 flex items-center gap-2 rounded-card border border-border bg-surface p-2 shadow-raised">
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder} className="min-h-[44px] flex-1 rounded-lg bg-transparent px-3 text-sm text-fg outline-none" />
        <button type="submit" disabled={!q.trim()} className="inline-flex min-h-[44px] items-center rounded-lg bg-[#18243B] px-4 text-sm font-semibold text-white hover:bg-[#24314d] disabled:opacity-50">{t.send}</button>
      </form>
      <p className="text-xs text-fg-subtle">{t.actionsNote}</p>
    </div>
  );
}
