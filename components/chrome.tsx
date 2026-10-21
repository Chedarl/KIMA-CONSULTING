"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { locales, type Locale } from "@/lib/i18n";

/**
 * Site chrome: navigation, the language switch and the theme toggle.
 *
 * Strings arrive as props rather than from `getDictionary`. This is a client
 * component, so importing the dictionary here would ship both full French and
 * English bundles to every visitor.
 *
 * The language switch rewrites the first path segment, preserving the rest of
 * the URL including query and hash, so the reader stays on the same screen in
 * the other language. Parity has to be navigable, not merely translated.
 */
export type ChromeLabels = {
  overview: string;
  taxpayer: string;
  workspace: string;
  design: string;
  language: string;
  mainNav: string;
  theme: string;
};

const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English" };

export function Chrome({ locale, labels }: { locale: Locale; labels: ChromeLabels }) {
  const pathname = usePathname() || `/${locale}`;
  const rest = pathname.split("/").slice(2).join("/");
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("kima-theme");
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      /* private mode or blocked storage — the system preference still applies */
    }
  }, []);

  function toggleTheme() {
    const current =
      theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("kima-theme", next);
    } catch {
      /* not persisting is acceptable; the toggle still works for this visit */
    }
  }

  const links = [
    { href: `/${locale}`, label: labels.overview },
    { href: `/${locale}/app`, label: labels.taxpayer },
    { href: `/${locale}/workspace`, label: labels.workspace },
    { href: `/${locale}/design`, label: labels.design },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link
          href={`/${locale}`}
          className="flex min-h-[44px] items-center gap-2.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={28} height={28} className="h-7 w-7" />
          <span className="text-sm font-bold tracking-tight text-fg">
            KIMA<span className="font-normal text-fg-muted"> Compliance OS</span>
          </span>
        </Link>

        <nav aria-label={labels.mainNav} className="order-3 w-full sm:order-2 sm:w-auto">
          <ul className="flex flex-wrap items-center gap-1">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm transition-colors ${
                      active
                        ? "bg-navy-soft font-semibold text-navy"
                        : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          {/* A hard navigation: [locale] is the root layout, so the whole
              document changes language, including <html lang>. */}
          <div
            className="flex items-center rounded-lg border border-border p-0.5"
            role="group"
            aria-label={labels.language}
          >
            {locales.map((l) => (
              <a
                key={l}
                href={`/${l}${rest ? `/${rest}` : ""}`}
                hrefLang={l}
                lang={l}
                aria-label={LOCALE_NAMES[l]}
                aria-current={l === locale ? "true" : undefined}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-2 text-xs font-semibold uppercase transition-colors ${
                  l === locale ? "bg-navy text-surface" : "text-fg-muted hover:bg-surface-sunken"
                }`}
              >
                {l}
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
            className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
            aria-label={labels.theme}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 16 16" className="h-4 w-4" stroke="currentColor" fill="none" aria-hidden="true">
                <path
                  d="M13.5 9.8A5.8 5.8 0 0 1 6.2 2.5a5.8 5.8 0 1 0 7.3 7.3z"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="h-4 w-4" stroke="currentColor" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="3.2" strokeWidth="1.5" />
                <path
                  d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
