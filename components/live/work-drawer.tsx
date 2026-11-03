"use client";

import Link from "next/link";

export type DrawerItem = { id: string; primary: string; secondary?: string; href: string };

export function WorkDrawer({
  title,
  items,
  empty,
  closeLabel,
  onClose,
}: {
  title: string;
  items: DrawerItem[];
  empty: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex justify-end bg-[#0D1B2A]/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <section className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-fg-muted hover:bg-surface-sunken">×</button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-sm text-fg-muted">{empty}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((it) => (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-surface-sunken"
                  >
                    <span className="min-w-0 truncate text-fg">{it.primary}</span>
                    {it.secondary ? <span className="shrink-0 truncate text-xs text-fg-subtle">{it.secondary}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
