import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { formatXaf, getDictionary } from "@/lib/i18n";
import type { FilingEvidence, StatusKind } from "@/lib/demo-data";
import { bucketOf, daysUntil } from "@/lib/demo-data";

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={`rounded-card border border-border bg-surface shadow-card ${className}`}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  action,
  dense = false,
}: {
  title: string;
  action?: ReactNode;
  dense?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-border ${
        dense ? "px-3 py-2" : "px-4 py-3 sm:px-5 sm:py-4"
      }`}
    >
      <h2 className={`font-semibold text-fg ${dense ? "text-sm" : "text-base"}`}>{title}</h2>
      {action}
    </div>
  );
}

/**
 * Status honesty (blueprint section 9): confirmed, draft, estimated and
 * awaiting-review must be visibly distinct. Colour alone never carries the
 * meaning — each state also has its own glyph and an explicit label, and the
 * two uncertain states (draft, estimated) use a dashed border.
 */
const statusStyle: Record<StatusKind, { cls: string; glyph: ReactNode; dashed?: boolean }> = {
  confirmed: {
    cls: "bg-teal-soft text-teal-text border-teal-text/30",
    glyph: (
      <path
        d="M3.5 7.2 6 9.7l5-5.4"
        fill="none"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  filed: {
    cls: "bg-navy-soft text-navy border-navy/30",
    glyph: (
      <>
        <rect x="3" y="2.5" width="8" height="9" rx="1.2" fill="none" strokeWidth="1.5" />
        <path d="M5.2 7.1 6.6 8.5l2.4-2.6" fill="none" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },
  draft: {
    cls: "bg-surface-sunken text-fg-muted border-border-strong",
    dashed: true,
    glyph: (
      <path
        d="M3 11 10.2 3.8a1.2 1.2 0 0 1 1.7 1.7L4.7 12.7 2.6 13z"
        fill="none"
        strokeWidth="1.4"
      />
    ),
  },
  estimated: {
    cls: "bg-amber-soft text-amber-text border-amber-text/40",
    dashed: true,
    glyph: (
      <path
        d="M2.4 8.6c1.2-2.6 2.6-2.6 3.8 0s2.6 2.6 3.8 0 2.6-2.6 3.8 0"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    ),
  },
  awaitingReview: {
    cls: "bg-surface-sunken text-fg border-border-strong",
    glyph: (
      <>
        <circle cx="7" cy="7" r="5" fill="none" strokeWidth="1.5" />
        <path d="M7 4.2V7l2.1 1.5" fill="none" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },
  awaitingEvidence: {
    cls: "bg-amber-soft text-amber-text border-amber-text/40",
    dashed: true,
    glyph: (
      <>
        <rect x="3" y="2.5" width="8" height="9" rx="1.2" fill="none" strokeWidth="1.5" />
        <path d="M5.4 7.4h3.2" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },
  actionNeeded: {
    cls: "bg-danger-soft text-danger-text border-danger-text/40",
    glyph: (
      <>
        <path d="M7 3v4.6" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="7" cy="10.6" r="0.95" strokeWidth="0" fill="currentColor" />
      </>
    ),
  },
};

export function StatusChip({
  kind,
  locale,
  size = "md",
}: {
  kind: StatusKind;
  locale: Locale;
  size?: "sm" | "md";
}) {
  const t = getDictionary(locale);
  const s = statusStyle[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${
        s.dashed ? "border-dashed" : ""
      } ${s.cls} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      } font-medium`}
    >
      <svg
        viewBox="0 0 14 14"
        className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"}
        stroke="currentColor"
        aria-hidden="true"
      >
        {s.glyph}
      </svg>
      {t.status[kind]}
    </span>
  );
}

export function Button({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
}) {
  const base =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors cursor-pointer";
  const styles = {
    primary: "bg-navy text-surface hover:bg-navy-strong",
    secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-sunken",
    quiet: "text-navy hover:bg-navy-soft",
  } as const;
  // next/link: client-side navigation and prefetch. Internal routes only.
  return (
    <Link href={href} className={`${base} ${styles[variant]}`}>
      {children}
    </Link>
  );
}

/** Amounts: whole francs, tabular figures, unit always stated. */
export function Money({
  amount,
  locale,
  className = "",
}: {
  amount: number | null;
  locale: Locale;
  className?: string;
}) {
  const t = getDictionary(locale);
  if (amount === null) {
    return (
      <span className={`text-fg-subtle ${className}`}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{locale === "fr" ? "Non renseigné" : "Not provided"}</span>
      </span>
    );
  }
  return (
    <span className={`tnum font-mono ${className}`}>
      {formatXaf(amount, locale)}
      {" "}
      <span className="text-[0.85em] text-fg-muted">{t.common.xaf}</span>
    </span>
  );
}

/** Document completeness, as a count and a bar — never a bare percentage. */
export function Completeness({ received, total }: { received: number; total: number }) {
  const complete = total > 0 && received >= total;
  const pct = total === 0 ? 0 : Math.min(100, Math.max(0, (received / total) * 100));
  return (
    <span className="flex items-center gap-2">
      <span className="tnum font-mono text-xs text-fg-muted">
        {received}/{total}
      </span>
      <span
        className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-sunken"
        aria-hidden="true"
      >
        <span
          className={`block h-full rounded-full ${complete ? "bg-teal" : "bg-amber"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

export function Timeline({
  steps,
}: {
  steps: { label: string; state: "done" | "current" | "todo" }[];
}) {
  return (
    <ol className="flex flex-col gap-0">
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                s.state === "done"
                  ? "border-teal-text bg-teal-text text-surface"
                  : s.state === "current"
                    ? "border-navy bg-surface"
                    : "border-border-strong bg-surface"
              }`}
            >
              {s.state === "done" ? (
                <svg viewBox="0 0 14 14" className="h-3 w-3" stroke="currentColor" aria-hidden="true">
                  <path
                    d="M3.5 7.2 6 9.7l5-5.4"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : s.state === "current" ? (
                <span className="h-2 w-2 rounded-full bg-navy" />
              ) : null}
            </span>
            {i < steps.length - 1 && (
              <span
                className={`my-0.5 w-0.5 flex-1 ${
                  s.state === "done" ? "bg-teal-text/40" : "bg-border"
                }`}
              />
            )}
          </div>
          <span
            className={`pb-4 text-sm ${
              s.state === "todo"
                ? "text-fg-subtle"
                : s.state === "current"
                  ? "font-semibold text-fg"
                  : "text-fg-muted"
            }`}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-card border border-dashed border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
      <svg
        viewBox="0 0 14 14"
        className="mt-0.5 h-4 w-4 shrink-0"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path d="M7 2.6v5" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="7" cy="10.8" r="0.95" fill="currentColor" strokeWidth="0" />
      </svg>
      <p>{children}</p>
    </div>
  );
}

/**
 * Due date, bucketed after PwC Connect's My Day: overdue, today, within seven
 * days, later. Quiet by default — colour appears only where action is needed,
 * so that colour means something when it does appear.
 */
export function DueBadge({
  dueOn,
  locale,
  settled = false,
}: {
  dueOn: string;
  locale: Locale;
  settled?: boolean;
}) {
  const t = getDictionary(locale);
  const bucket = settled ? "later" : bucketOf(dueOn);
  const days = daysUntil(dueOn);

  // A settled obligation is never "overdue" — the deadline stopped applying.
  if (settled || bucket === "later") {
    return <span className="tnum font-mono text-xs text-fg-muted">{dueOn}</span>;
  }

  const style =
    bucket === "overdue"
      ? "bg-danger-soft text-danger-text border-danger-text/30"
      : bucket === "today"
        ? "bg-amber-soft text-amber-text border-amber-text/40"
        : "bg-surface-sunken text-fg-muted border-border-strong";

  const label =
    bucket === "overdue"
      ? `${t.work.overdue} · ${Math.abs(days)}${t.work.metrics.days}`
      : bucket === "today"
        ? t.work.today
        : `${days}${t.work.metrics.days}`;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style}`}
    >
      <span className="tnum font-mono">{label}</span>
    </span>
  );
}

/** One metric in the workspace strip. The definition travels with the number. */
export function Metric({
  value,
  label,
  hint,
  tone = "neutral",
}: {
  value: string;
  label: string;
  hint?: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <p
        className={`tnum font-mono text-xl font-semibold ${
          tone === "warn" ? "text-amber-text" : "text-navy"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-snug text-fg-muted">{label}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-fg-subtle">{hint}</p>}
    </div>
  );
}

/**
 * Filing evidence, shown wherever a declaration claims to be filed. Without it
 * a declaration is not filed — it is `awaitingEvidence` (Scenario F).
 */
export function EvidenceRef({ evidence, locale }: { evidence: FilingEvidence; locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
      <span className="font-medium">{t.work.evidence}</span>
      <code className="tnum rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px]">
        {evidence.reference}
      </code>
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="mb-6">
      {eyebrow && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-text">
          {eyebrow}
        </p>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h1>
      {lede && <p className="mt-2 max-w-2xl text-fg-muted">{lede}</p>}
    </header>
  );
}
