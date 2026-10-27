"use client";

import type { ReactNode } from "react";
import { clientStep, type ClientStatus } from "@/lib/cases";

/** Display position of the client-facing states. Not a stored percent. */
export function progressPercent(status: ClientStatus): number {
  return [20, 40, 60, 80, 100][clientStep(status)] ?? 0;
}

export function formatDay(iso: string | null | undefined, locale: "fr" | "en"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CM" : "en-CM", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Douala",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function formatFullDate(iso: string | null | undefined, locale: "fr" | "en"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CM" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "Africa/Douala",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function xaf(minor: number, locale: "fr" | "en"): string {
  const n = new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM", {
    maximumFractionDigits: 0,
  }).format(minor);
  return `XAF ${n}`;
}

export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-fg-muted">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryButton({
  children,
  type = "button",
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a42] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-teal-text disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "green-outline" | "amber" | "amber-outline" | "muted" | "danger";
}) {
  const cls =
    tone === "green"
      ? "bg-teal-soft text-teal-text"
      : tone === "green-outline"
        ? "border border-teal-text/40 bg-white text-teal-text"
        : tone === "amber"
          ? "bg-amber-soft text-amber-text"
          : tone === "amber-outline"
            ? "border border-amber-text/40 bg-white text-amber-text"
            : tone === "danger"
              ? "bg-danger-soft text-danger-text"
              : "border border-border bg-surface-sunken text-fg-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-white px-5 py-8 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{hint}</p>}
    </div>
  );
}

export function OfflineNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-amber/40 bg-amber-soft px-4 py-3 text-sm text-amber-text" role="status">
      {children}
    </p>
  );
}

export function LoadingRows({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-card bg-white" />
      ))}
    </div>
  );
}

/**
 * Numbered rail for the five client-facing states.
 * The index comes from `clientStatus`, never from a firm stage name.
 */
export function StatusStepper({
  title,
  labels,
  current,
}: {
  title: string;
  labels: string[];
  current: number;
}) {
  return (
    <section className="rounded-card border border-border bg-white p-5 shadow-card">
      <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
      <ol className="mt-6 flex" aria-label={title}>
        {labels.map((label, i) => {
          const filled = i <= current;
          const lineAfter = i < current;
          return (
            <li key={label} className="flex min-w-0 flex-1 flex-col items-center" aria-current={i === current ? "step" : undefined}>
              <div className="flex w-full items-center">
                <span
                  aria-hidden
                  className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : i <= current ? "bg-teal" : "bg-border"}`}
                />
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    filled ? "bg-teal text-white" : "border-2 border-border bg-white text-fg-subtle"
                  }`}
                >
                  {i + 1}
                </span>
                <span
                  aria-hidden
                  className={`h-0.5 flex-1 ${
                    i === labels.length - 1 ? "bg-transparent" : lineAfter ? "bg-teal" : "bg-border"
                  }`}
                />
              </div>
              <span className={`mt-2 px-1 text-center text-xs ${i === current ? "font-semibold text-fg" : "text-fg-muted"}`}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function FilterBar({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block max-w-sm">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-navy"
      />
    </label>
  );
}

export function cardClass(extra = "") {
  return `rounded-card border border-border bg-white shadow-card transition-shadow hover:shadow-raised ${extra}`;
}
