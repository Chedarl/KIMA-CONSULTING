import type { ReactNode } from "react";

/**
 * Small display pieces for the incident prototype. They reuse the site's
 * tokens (navy, teal, amber, surface, border) and the card shape from
 * `components/ui.tsx`; nothing here imitates a seal, a stamp or a certificate.
 */

export type BasisTone = "declared" | "verified" | "recorded";

const tone: Record<BasisTone, string> = {
  declared: "border-dashed border-amber-text/40 bg-amber-soft text-amber-text",
  verified: "border-teal-text/30 bg-teal-soft text-teal-text",
  recorded: "border-border-strong bg-surface-sunken text-fg-muted",
};

/** The basis of a value — said in words, not only in colour. */
export function BasisChip({ basis, children }: { basis: BasisTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone[basis]}`}>
      <svg viewBox="0 0 14 14" className="h-3 w-3" stroke="currentColor" fill="none" aria-hidden="true">
        {basis === "verified" ? (
          <path d="M3.5 7.2 6 9.7l5-5.4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ) : basis === "declared" ? (
          <path d="M3 11 10.2 3.8a1.2 1.2 0 0 1 1.7 1.7L4.7 12.7 2.6 13z" strokeWidth="1.4" />
        ) : (
          <circle cx="7" cy="7" r="4.5" strokeWidth="1.5" />
        )}
      </svg>
      {children}
    </span>
  );
}

export function Panel({
  title,
  children,
  id,
  className = "",
}: {
  title: string;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`rounded-card border border-border bg-surface shadow-card ${className}`}>
      <h2 id={id} className="border-b border-border px-4 py-3 font-display text-base font-semibold text-fg">
        {title}
      </h2>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** Africa/Douala is UTC+01:00 all year, so the stamp is computed, not looked up — identical on server and client. */
export function doualaStamp(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 3_600_000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`;
}

export function nowInDouala(): string {
  const shifted = new Date(Date.now() + 3_600_000).toISOString();
  return `${shifted.slice(0, 19)}+01:00`;
}

export function Stamp({ iso, zone }: { iso: string; zone: string }) {
  return (
    <time dateTime={iso} className="tnum font-mono text-xs text-fg-muted" title={zone}>
      {doualaStamp(iso)}
    </time>
  );
}

export const fieldCls =
  "mt-1 block min-h-[44px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg";

export const buttonCls =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors";

export const primaryBtn = `${buttonCls} bg-navy text-white hover:bg-navy-strong`;
export const secondaryBtn = `${buttonCls} border border-border-strong bg-surface text-fg hover:bg-surface-sunken`;
