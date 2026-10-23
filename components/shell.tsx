"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * The workspace shell: a persistent left rail plus a content area, after the
 * Settle operations-dashboard reference.
 *
 * Navigation items carry a `ready` flag. A module that does not exist yet
 * renders as a disabled item with a "soon" marker rather than a link that
 * 404s — the client should never feel lost, and a dead link is the fastest way
 * to lose their trust in everything else on the screen.
 *
 * Labels arrive as props: this is a client component, so importing the
 * dictionary here would ship both languages to every visitor.
 */
export type IconName =
  | "grid"
  | "shield"
  | "folder"
  | "file"
  | "chat"
  | "card"
  | "archive"
  | "help"
  | "user"
  | "inbox"
  | "queue"
  | "calendar"
  | "check"
  | "chart"
  | "cog"
  | "people";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  ready: boolean;
};

export function Shell({
  nav,
  title,
  subtitle,
  soonLabel,
  menuLabel,
  tone = "light",
  children,
}: {
  nav: NavItem[];
  title: string;
  subtitle: string;
  soonLabel: string;
  menuLabel: string;
  /** Firm workspace uses the brand navy rail. Client stays on the light rail. */
  tone?: "light" | "navy";
  children: ReactNode;
}) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);

  // Close the mobile rail after navigating, or it stays over the content.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:gap-7">
      {/* On a phone the rail collapses behind a disclosure rather than
          shrinking a desktop layout, so the work itself stays the priority. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-[44px] items-center justify-between gap-2 rounded-rail border border-border bg-surface px-3 text-sm font-semibold text-fg lg:hidden"
      >
        {menuLabel}
        <svg
          viewBox="0 0 16 16"
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          stroke="currentColor"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <nav
        aria-label={menuLabel}
        className={`${open ? "block" : "hidden"} shrink-0 lg:block ${tone === "navy" ? "lg:w-60" : "lg:w-56"}`}
      >
        <ul
          className={`flex flex-col gap-0.5 ${
            tone === "navy" ? "rounded-card bg-rail p-2 text-rail-fg" : ""
          }`}
        >
          {tone === "navy" && (
            <li className="px-3 pb-2 pt-2">
              <p className="font-display text-sm font-bold tracking-wide text-rail-fg">KIMA OS</p>
              <p className="text-xs text-rail-muted">{title}</p>
            </li>
          )}
          {nav.map((item) => {
            // Overview is a prefix of every firm route, so only an exact
            // match counts. A section lights up on its own detail routes.
            const isPrefix = nav.some(
              (other) => other.href !== item.href && other.href.startsWith(`${item.href}/`),
            );
            const active = isPrefix
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            if (!item.ready) {
              return (
                <li key={item.label}>
                  {/* Not a link and not aria-disabled: aria-disabled on a
                      bare span is not a supported pattern and most screen
                      readers ignore it. The "soon" text carries the meaning,
                      separated so it is not read as one run-on phrase. */}
                  <span
                    className={`rail-item flex min-h-[44px] cursor-default items-center gap-2.5 px-3 text-sm ${
                      tone === "navy" ? "text-rail-muted" : "text-fg-subtle"
                    }`}
                  >
                    <Icon name={item.icon} />
                    <span className="flex-1 break-words">{item.label}</span>
                    <span className="sr-only">, </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        tone === "navy" ? "bg-white/15 text-rail-muted" : "bg-surface-sunken"
                      }`}
                    >
                      {soonLabel}
                    </span>
                  </span>
                </li>
              );
            }
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rail-item flex min-h-[44px] items-center gap-2.5 px-3 text-sm transition-colors focus-visible:outline-white ${
                    tone === "navy"
                      ? active
                        ? "bg-rail-fg font-semibold text-rail"
                        : "text-rail-muted hover:bg-white/10 hover:text-rail-fg"
                      : active
                        ? "bg-navy font-semibold text-surface"
                        : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
                  }`}
                >
                  <Icon name={item.icon} />
                  <span className="break-words">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        {tone === "light" && (
          <header className="mb-5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">{title}</h1>
            <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
          </header>
        )}
        {tone === "navy" && <p className="sr-only">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

const PATHS: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="2.5" y="2.5" width="5" height="5" rx="1.2" />
      <rect x="10.5" y="2.5" width="5" height="5" rx="1.2" />
      <rect x="2.5" y="10.5" width="5" height="5" rx="1.2" />
      <rect x="10.5" y="10.5" width="5" height="5" rx="1.2" />
    </>
  ),
  shield: <path d="M9 2.2l5.5 2.2v4.4c0 3.3-2.3 6.1-5.5 7-3.2-.9-5.5-3.7-5.5-7V4.4z" />,
  folder: (
    <path d="M2.5 5.2a1.2 1.2 0 0 1 1.2-1.2h3.3l1.4 1.8h5.4a1.2 1.2 0 0 1 1.2 1.2v6.3a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2z" />
  ),
  file: (
    <>
      <path d="M4.5 2.5h5.2l3.8 3.8v9.2H4.5z" />
      <path d="M9.7 2.5v3.8h3.8" />
    </>
  ),
  chat: (
    <path d="M2.8 4.2a1.3 1.3 0 0 1 1.3-1.3h9.8a1.3 1.3 0 0 1 1.3 1.3v6.4a1.3 1.3 0 0 1-1.3 1.3H7l-4.2 3z" />
  ),
  card: (
    <>
      <rect x="2.2" y="4" width="13.6" height="10" rx="1.6" />
      <path d="M2.2 7.4h13.6" />
    </>
  ),
  archive: (
    <>
      <rect x="2.2" y="3" width="13.6" height="3.4" rx="1" />
      <path d="M3.6 6.4v7.4a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2V6.4" />
      <path d="M7.2 9.4h3.6" />
    </>
  ),
  help: (
    <>
      <circle cx="9" cy="9" r="6.6" />
      <path d="M7.2 7a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.7-.8 1.2v.4" />
      <circle cx="9" cy="12.8" r="0.5" fill="currentColor" />
    </>
  ),
  user: (
    <>
      <circle cx="9" cy="6.2" r="2.9" />
      <path d="M3.6 15.2a5.4 5.4 0 0 1 10.8 0" />
    </>
  ),
  inbox: (
    <>
      <path d="M2.4 9.6h3.4l1.2 2h4l1.2-2h3.4" />
      <path d="M3.9 4.2h10.2l1.5 5.4v4.2a1.2 1.2 0 0 1-1.2 1.2H3.6a1.2 1.2 0 0 1-1.2-1.2V9.6z" />
    </>
  ),
  queue: (
    <>
      <path d="M6 4.6h9.4M6 9h9.4M6 13.4h9.4" />
      <circle cx="3" cy="4.6" r="1" fill="currentColor" />
      <circle cx="3" cy="9" r="1" fill="currentColor" />
      <circle cx="3" cy="13.4" r="1" fill="currentColor" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.6" y="3.8" width="12.8" height="11.4" rx="1.4" />
      <path d="M2.6 7.2h12.8M6 2.4v2.8M12 2.4v2.8" />
    </>
  ),
  check: (
    <>
      <circle cx="9" cy="9" r="6.6" />
      <path d="M5.9 9.2l2.1 2.1 4.1-4.4" />
    </>
  ),
  chart: (
    <>
      <path d="M2.8 15.2h12.4" />
      <path d="M5 15.2V9M9 15.2V4.4M13 15.2v-4" />
    </>
  ),
  cog: (
    <>
      <circle cx="9" cy="9" r="2.4" />
      <path d="M9 2.4v1.8M9 13.8v1.8M15.6 9h-1.8M4.2 9H2.4M13.7 4.3l-1.3 1.3M5.6 12.4l-1.3 1.3M13.7 13.7l-1.3-1.3M5.6 5.6L4.3 4.3" />
    </>
  ),
  people: (
    <>
      <circle cx="6.8" cy="6.4" r="2.5" />
      <path d="M2.4 14.6a4.4 4.4 0 0 1 8.8 0" />
      <path d="M11.6 4.2a2.5 2.5 0 0 1 0 4.8M12.6 14.6a4.4 4.4 0 0 0-1.3-3.1" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
