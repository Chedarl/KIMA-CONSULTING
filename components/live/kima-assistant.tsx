"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { kimaChecklist, kimaGuides, type GuideLocale } from "@/lib/kima-guides";

export type KimaLabels = {
  name: string;
  subtitle: string;
  openHelp: string;
  close: string;
  tabGuide: string;
  tabChecklist: string;
  tabSearch: string;
  searchPlaceholder: string;
  stepsTitle: string;
  firstActionTitle: string;
  cautionTitle: string;
  nothingFound: string;
  askAccountant: string;
  welcome: string;
  done: string;
};

const STORE = "kima-checklist-v1";

/**
 * Kima, the in-product assistant.
 *
 * Three deliberate properties, borrowed from the products we studied and the
 * house rules: the guide is contextual (it follows the page), the getting-
 * started checklist is outcome-based and persistent, and the search only
 * answers from the verified corpus — when nothing matches, Kima says so
 * instead of inventing, exactly like the Clarity engine.
 */
export function KimaAssistant({ locale, t }: { locale: GuideLocale; t: KimaLabels }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"guide" | "checklist" | "search">("guide");
  const [query, setQuery] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  const guide = useMemo(() => {
    const g = kimaGuides.find((x) => x.match.test(pathname ?? ""));
    return g ?? null;
  }, [pathname]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return kimaGuides.filter((g) =>
      [g.title[locale], g.purpose[locale], ...g.steps[locale]]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, locale]);

  const checklist = kimaChecklist[locale];
  const doneCount = checklist.filter((c) => done[c.id]).length;

  function toggle(id: string) {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try {
      window.localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* progress is a nicety; persistence is best-effort */
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={t.openHelp}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-gold/60 bg-surface shadow-raised transition hover:scale-105"
      >
        <Image src="/brand/kima-avatar.svg" alt="" width={44} height={44} className="h-11 w-11 rounded-full" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t.name}
          className="fixed bottom-24 right-5 z-40 flex max-h-[72vh] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-raised"
        >
          <div className="flex items-center gap-3 border-b border-border bg-surface-sunken px-4 py-3">
            <Image src="/brand/kima-avatar.svg" alt="" width={40} height={40} className="h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold text-fg">{t.name}</p>
              <p className="truncate text-xs text-fg-muted">{t.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface"
            >
              ×
            </button>
          </div>

          <div className="flex gap-1 border-b border-border px-3 pt-2">
            {(
              [
                ["guide", t.tabGuide],
                ["checklist", t.tabChecklist],
                ["search", t.tabSearch],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={
                  "min-h-[36px] rounded-t-lg px-3 text-sm font-semibold " +
                  (tab === id
                    ? "border border-b-0 border-border bg-surface text-teal-text"
                    : "text-fg-muted hover:text-fg")
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {tab === "guide" && !guide ? (
              <p className="text-sm text-fg-muted">{t.welcome}</p>
            ) : null}

            {tab === "guide" && guide ? (
              <div className="flex flex-col gap-3">
                <p className="font-display text-base font-semibold text-fg">{guide.title[locale]}</p>
                <p className="text-sm text-fg-muted">{guide.purpose[locale]}</p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-text">{t.firstActionTitle}</p>
                  <p className="mt-1 text-sm text-fg">{guide.firstAction[locale]}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t.stepsTitle}</p>
                  <ol className="mt-1 flex flex-col gap-1.5">
                    {guide.steps[locale].map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-fg">
                        <span className="font-mono text-xs text-gold">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                {guide.caution ? (
                  <p className="rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 text-sm text-amber-text">
                    <span className="font-semibold">{t.cautionTitle} : </span>
                    {guide.caution[locale]}
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === "checklist" ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-fg-muted">
                  {doneCount} / {checklist.length} {t.done}
                </p>
                {checklist.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={
                      "flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm " +
                      (done[c.id] ? "border-teal-text/40 text-fg-muted" : "border-border text-fg")
                    }
                  >
                    <span
                      aria-hidden
                      className={
                        "mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] " +
                        (done[c.id] ? "border-teal-text bg-teal-text text-surface" : "border-border-strong")
                      }
                    >
                      {done[c.id] ? "✓" : ""}
                    </span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {tab === "search" ? (
              <div className="flex flex-col gap-3">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  aria-label={t.searchPlaceholder}
                  className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
                />
                {query.trim() && hits.length === 0 ? (
                  <p className="text-sm text-fg-muted">
                    {t.nothingFound} {t.askAccountant}
                  </p>
                ) : null}
                {hits.map((g) => (
                  <div key={g.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold text-fg">{g.title[locale]}</p>
                    <p className="mt-1 text-sm text-fg-muted">{g.firstAction[locale]}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
