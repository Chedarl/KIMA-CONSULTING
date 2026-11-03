"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { obligationLabel } from "@/lib/cases";
import { normalise } from "@/lib/clarity";

type NavItem = { href: string; label: string; ready?: boolean };

export type PaletteLabels = {
  placeholder: string;
  groupNavigate: string;
  groupCases: string;
  noResults: string;
  hint: string;
};

/**
 * ⌘K / Ctrl-K. Navigation plus live case and client search in one overlay, the
 * same muscle memory QuickBooks and Linear teach. It is a keyboard, not a menu.
 */
export function CommandPalette({
  locale,
  nav,
  labels,
}: {
  locale: "fr" | "en";
  nav: NavItem[];
  labels: PaletteLabels;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [cases, setCases] = useState<{ id: string; name: string; label: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    if (loaded) return;
    (async () => {
      const db = supabase();
      const [cs, tp] = await Promise.all([
        db.from("compliance_cases").select("id, taxpayer_id, obligation_code, period_token").is("closed_at", null).limit(200),
        db.from("taxpayers").select("id, legal_name").limit(500),
      ]);
      const names = Object.fromEntries(((tp.data ?? []) as { id: string; legal_name: string }[]).map((t) => [t.id, t.legal_name]));
      setCases(
        ((cs.data ?? []) as { id: string; taxpayer_id: string; obligation_code: string; period_token: string }[]).map(
          (c) => ({
            id: c.id,
            name: names[c.taxpayer_id] ?? "",
            label: obligationLabel(c.obligation_code, locale) + " · " + c.period_token,
          }),
        ),
      );
      setLoaded(true);
    })();
  }, [open, loaded, locale]);

  const q = normalise(query);
  const navHits = useMemo(
    () => (q ? nav.filter((n) => normalise(n.label).includes(q)) : nav),
    [nav, q],
  );
  const caseHits = useMemo(
    () => (q ? cases.filter((c) => normalise(c.name + " " + c.label).includes(q)).slice(0, 8) : cases.slice(0, 8)),
    [cases, q],
  );

  const rows: { id: string; href: string; primary: string; secondary?: string }[] = [
    ...navHits.map((n) => ({ id: n.href, href: n.href, primary: n.label })),
    ...caseHits.map((c) => ({ id: c.id, href: `/${locale}/workspace/cases/${c.id}`, primary: c.name, secondary: c.label })),
  ];

  useEffect(() => setActive(0), [query]);

  function go(href: string) {
    setOpen(false);
    // Full navigation: the palette must survive a stale HMR client where
    // router.push can be a no-op, and a hard assign is deterministic.
    window.location.assign(href);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.placeholder}
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#0D1B2A]/40 p-4 pt-[12vh]"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4">
          <span className="text-fg-subtle" aria-hidden>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && rows[active]) go(rows[active].href);
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            className="min-h-[52px] flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="rounded border border-border px-1.5 text-[10px] text-fg-subtle">Esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{labels.groupNavigate}</p>
          {navHits.length === 0 && caseHits.length === 0 ? (
            <p className="px-2 py-3 text-sm text-fg-muted">{labels.noResults}</p>
          ) : null}
          <ul role="listbox" aria-label={labels.groupNavigate}>
            {navHits.map((n) => {
              const i = rows.findIndex((r) => r.id === n.href);
              return (
                <li key={n.href}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(n.href)}
                    className={`flex min-h-[40px] w-full items-center rounded-lg px-3 text-left text-sm ${i === active ? "bg-surface-sunken text-fg" : "text-fg-muted"}`}
                  >
                    {n.label}
                  </button>
                </li>
              );
            })}
          </ul>
          {caseHits.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{labels.groupCases}</p>
              <ul role="listbox" aria-label={labels.groupCases}>
                {caseHits.map((c) => {
                  const i = rows.findIndex((r) => r.id === c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(`/${locale}/workspace/cases/${c.id}`)}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm ${i === active ? "bg-surface-sunken text-fg" : "text-fg-muted"}`}
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="shrink-0 truncate text-xs text-fg-subtle">{c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="px-2 pb-1 pt-3 text-[10px] text-fg-subtle">{labels.hint}</p>
        </div>
      </div>
    </div>
  );
}
