"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getDictionary, locales, type Locale } from "@/lib/i18n";

/**
 * Site chrome: navigation, the language switch and the theme toggle.
 *
 * The language switch rewrites the first path segment, so it keeps the reader
 * on the same screen in the other language — parity has to be navigable, not
 * just translated.
 */
export function Chrome({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const pathname = usePathname() || `/${locale}`;
  const rest = pathname.split("/").slice(2).join("/");
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("kima-theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        document.documentElement.dataset.theme = stored;
      }
    } catch {
      /* private mode or blocked storage — the system preference still applies */
    }
  }, []);

  function toggleTheme() {
    const next =
      theme === "dark"
        ? "light"
        : theme === "light"
          ? "dark"
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "light"
            : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("kima-theme", next);
    } catch {
      /* not persisting is acceptable; the toggle still works for this visit */
    }
  }

  const links = [
    { href: `/${locale}`, label: t.nav.overview },
    { href: `/${locale}/app`, label: t.nav.taxpayer },
    { href: `/${locale}/workspace`, label: t.nav.workspace },
    { href: `/${locale}/design`, label: t.nav.design },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <a href={`/${locale}`} className="flex items-center gap-2.5">
          <Mark />
          <span className="text-sm font-bold tracking-tight text-fg">
            KIMA<span className="font-normal text-fg-muted"> Compliance OS</span>
          </span>
        </a>

        <nav aria-label={t.nav.overview} className="order-3 w-full sm:order-2 sm:w-auto">
          <ul className="flex flex-wrap items-center gap-1">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <li key={l.href}>
                  <a
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm transition-colors ${
                      active
                        ? "bg-navy-soft font-semibold text-navy"
                        : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
                    }`}
                  >
                    {l.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          <div
            className="flex items-center rounded-lg border border-border p-0.5"
            role="group"
            aria-label={t.nav.language}
          >
            {locales.map((l) => (
              <a
                key={l}
                href={`/${l}${rest ? `/${rest}` : ""}`}
                aria-current={l === locale ? "true" : undefined}
                className={`inline-flex min-h-[36px] min-w-[40px] items-center justify-center rounded-md px-2 text-xs font-semibold uppercase transition-colors ${
                  l === locale ? "bg-navy text-white" : "text-fg-muted hover:bg-surface-sunken"
                }`}
              >
                {l}
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
            aria-label={locale === "fr" ? "Changer de thème" : "Switch theme"}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" stroke="currentColor" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="3.2" strokeWidth="1.5" />
              <path
                d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
      <rect width="28" height="28" rx="7" className="fill-navy" />
      <path
        d="M8 19.5V8.5M8 14l6-5.5M8 14l6.5 5.5"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="20" cy="9.6" r="2.1" className="fill-teal" />
    </svg>
  );
}

export function Footer({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-fg-muted">
        <p className="font-semibold text-fg">{t.company}</p>
        <p className="mt-1">{t.tagline}</p>
        <p className="mt-3 text-xs text-fg-subtle">
          {locale === "fr"
            ? "Prototype d'interface — aucune autorisation, aucun partenariat et aucune intégration de télédéclaration avec la DGI n'est établi ou revendiqué."
            : "Interface prototype — no DGI authorization, partnership or e-filing integration is established or claimed."}
        </p>
      </div>
    </footer>
  );
}
