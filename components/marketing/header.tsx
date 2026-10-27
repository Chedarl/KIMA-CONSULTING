"use client";

import Link from "next/link";
import { useState } from "react";
import { KimaWordmark } from "@/components/marketing/wordmark";
import type { getPublicCopy } from "@/lib/i18n-public";

type Copy = ReturnType<typeof getPublicCopy>;

const ANCHORS = ["services", "pricing", "about", "resources", "contact"] as const;

export function MarketingHeader({
  locale,
  labels,
  tone = "inverse",
  ctaHref,
}: {
  locale: "fr" | "en";
  labels: Copy["header"];
  tone?: "inverse" | "plain";
  ctaHref: string;
}) {
  const [open, setOpen] = useState(false);
  const inverse = tone === "inverse";
  const other: "fr" | "en" = locale === "fr" ? "en" : "fr";
  const link = inverse
    ? "text-white/90 hover:text-white"
    : "text-fg-muted hover:text-fg";

  const items = ANCHORS.map((key) => ({
    href: `/${locale}#${key}`,
    label: labels[key],
  }));

  return (
    <header
      className={`sticky top-0 z-30 ${
        inverse ? "bg-[#0D1B2A] text-white" : "border-b border-border bg-white text-fg"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href={`/${locale}`} className="inline-flex min-h-[44px] items-center" aria-label="KIMA CONSULTING">
          <KimaWordmark
            tone={inverse ? "light" : "dark"}
            className="max-sm:max-w-[6.5rem]"
          />
        </Link>

        <nav aria-label={labels.mainNav} className="ml-auto hidden items-center gap-6 lg:flex">
          {items.map((item) => (
            <a key={item.href} href={item.href} className={`text-sm font-medium ${link}`}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-6">
          <a
            href={`/${other}`}
            hrefLang={other}
            lang={other}
            aria-label={labels.language}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-3 text-xs font-semibold uppercase ${
              inverse ? "text-white hover:bg-white/10" : "border border-border text-fg hover:bg-surface-sunken"
            }`}
          >
            {locale.toUpperCase()}
          </a>
          <Link
            href={ctaHref}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-semibold text-white ${
              inverse ? "public-cta" : "bg-[#0D1B2A] hover:bg-[#15283d]"
            }`}
          >
            {labels.getStarted}
          </Link>
          <button
            type="button"
            className={`inline-flex h-11 w-11 items-center justify-center rounded-lg lg:hidden ${
              inverse ? "text-white hover:bg-white/10" : "border border-border"
            }`}
            aria-expanded={open}
            aria-controls="public-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? labels.closeMenu : labels.openMenu}</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="public-menu" aria-label={labels.mainNav} className="border-t border-white/10 px-4 py-2 lg:hidden">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={`flex min-h-[44px] items-center text-sm font-medium ${link}`}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
