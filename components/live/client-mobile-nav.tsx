"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Labels = {
  home: string;
  documents: string;
  messages: string;
  more: string;
};

/**
 * Phone navigation for the client portal.
 *
 * Four stops, always visible: home, documents, messages, and the rest.
 * The desktop rail stays for a wide screen.
 */
export function ClientMobileNav({ locale, labels }: { locale: "fr" | "en"; labels: Labels }) {
  const path = usePathname() || "";
  const base = `/${locale}/app`;
  const items: { href: string; label: string; icon: "home" | "folder" | "chat" | "more" }[] = [
    { href: base, label: labels.home, icon: "home" },
    { href: `${base}/documents`, label: labels.documents, icon: "folder" },
    { href: `${base}/messages`, label: labels.messages, icon: "chat" },
    { href: `${base}/more`, label: labels.more, icon: "more" },
  ];

  return (
    <nav
      aria-label={labels.more}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((item) => {
          const active =
            item.href === base ? path === base : path === item.href || path.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold ${
                  active ? "text-teal-text" : "text-fg-muted"
                }`}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavIcon({ name }: { name: "home" | "folder" | "chat" | "more" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "home" && (
        <>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </>
      )}
      {name === "folder" && <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v9A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z" />}
      {name === "chat" && <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8A1.5 1.5 0 0 1 17.5 16H9l-4 3z" />}
      {name === "more" && (
        <>
          <circle cx="6" cy="12" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <circle cx="18" cy="12" r="1.2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
