"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabLink = { href: string; label: string; ready: boolean };
export type TabSection = { key: string; path: string; tabs: TabLink[] };

/**
 * The second level of the workspace IA.
 *
 * Collapsing the rail from 21 entries to nine is only safe if the screens that
 * left the rail keep a visible way in. This is that way in: the active
 * section's sibling screens, as a strip under the header.
 *
 * These are links between routes, not ARIA tabs. The tab role requires a
 * tabpanel the control owns, and these navigate the page instead, so this is a
 * labelled nav with aria-current on the current screen. Announcing it as a
 * tablist would promise a widget that is not here.
 *
 * Sections with a single screen render nothing rather than a strip of one.
 */
export function SectionTabs({
  base,
  sections,
  label,
}: {
  base: string;
  sections: TabSection[];
  label: string;
}) {
  const pathname = usePathname() ?? "";
  const after = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const current = after.replace(/\/+$/, "");

  const active = sections.find((s) =>
    s.tabs.some((t) => {
      const p = t.href.slice(base.length);
      return current === p || current.startsWith(p + "/");
    }),
  );
  if (!active || active.tabs.length < 2) return null;

  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {active.tabs.map((tab) => {
          const p = tab.href.slice(base.length);
          const isCurrent = current === p || current.startsWith(p + "/");
          if (!tab.ready) {
            return (
              <li key={tab.href}>
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-[44px] cursor-not-allowed items-center rounded-lg px-3 text-sm text-fg-subtle"
                >
                  {tab.label}
                </span>
              </li>
            );
          }
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isCurrent ? "page" : undefined}
                className={
                  "inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-text " +
                  (isCurrent
                    ? "bg-surface text-fg shadow-sm ring-1 ring-border"
                    : "text-fg-muted hover:bg-surface hover:text-fg")
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
