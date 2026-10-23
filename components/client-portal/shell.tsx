"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePortalCopy } from "@/components/client-portal/copy";
import { obligationLabel } from "@/lib/cases";
import { demoIds, supabase } from "@/lib/supabase";

type IconName =
  | "home"
  | "people"
  | "folder"
  | "clipboard"
  | "mail"
  | "globe"
  | "calendar"
  | "archive"
  | "user";

const ICONS: Record<IconName, JSX.Element> = {
  home: (
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="2.2" />
      <path d="M4.5 18c.6-2.4 2.4-3.6 4.5-3.6S13 15.6 13.6 18" />
      <circle cx="16" cy="9" r="1.7" />
      <path d="M14.2 18c.3-1.6 1.4-2.6 2.8-2.6 1.2 0 2.2.7 2.6 2" />
    </>
  ),
  folder: <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H9l1.6 2H18.5A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />,
  clipboard: (
    <>
      <rect x="6" y="4.5" width="12" height="15" rx="1.6" />
      <path d="M9 4.5h6v2H9z" />
      <path d="M9 11h6M9 14.5h4" />
    </>
  ),
  mail: <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5zM4.5 7.5 12 12.5 19.5 7.5" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.2 2.4 3.2 5 3.2 8s-1 5.6-3.2 8c-2.2-2.4-3.2-5-3.2-8s1-5.6 3.2-8z" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="1.6" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7.5h16v11.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M3 4.5h18v3H3zM10 12h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="2.6" />
      <path d="M6 19c.8-3 2.8-4.5 6-4.5s5.2 1.5 6 4.5" />
    </>
  ),
};

function Glyph({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

type Business = { id: string; legal_name: string };
type Hit = { href: string; title: string; detail: string };

export function ClientPortalShell({
  locale,
  children,
}: {
  locale: "fr" | "en";
  children: React.ReactNode;
}) {
  const copy = usePortalCopy();
  const path = usePathname() || "";
  const router = useRouter();
  const base = `/${locale}/app`;
  const [open, setOpen] = useState(false);
  const [biz, setBiz] = useState<Business[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bizOpen, setBizOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const catalogue = useRef<Hit[]>([]);

  const nav: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
    { href: base, label: copy.nav.dashboard, icon: "home", exact: true },
    { href: `${base}/services`, label: copy.nav.services, icon: "people" },
    { href: `${base}/documents`, label: copy.nav.documents, icon: "folder" },
    { href: `${base}/requests`, label: copy.nav.requests, icon: "clipboard" },
    { href: `${base}/messages`, label: copy.nav.messages, icon: "mail" },
    { href: `${base}/payments`, label: copy.nav.payments, icon: "globe" },
    { href: `${base}/calendar`, label: copy.nav.calendar, icon: "calendar" },
    { href: `${base}/records`, label: copy.nav.records, icon: "archive" },
    { href: `${base}/profile`, label: copy.nav.profile, icon: "user" },
  ];

  useEffect(() => {
    setOpen(false);
    setBizOpen(false);
    setLangOpen(false);
    setBellOpen(false);
    setSearchOpen(false);
  }, [path]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setBizOpen(false);
        setLangOpen(false);
        setBellOpen(false);
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const db = supabase();
        const ids = await demoIds();
        if (cancelled) return;
        setActiveId(ids?.taxpayerId ?? null);
        const { data } = await db.from("taxpayers").select("id, legal_name").order("legal_name");
        if (cancelled) return;
        setBiz((data ?? []) as Business[]);
        const tid = ids?.taxpayerId;
        if (tid) {
          const { count } = await db
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("taxpayer_id", tid)
            .eq("sender", "firm")
            .is("read_at", null);
          if (!cancelled) setUnread(count ?? 0);
        }
        const [cases, requests] = await Promise.all([
          db.from("compliance_cases").select("id, obligation_code, period_token").order("due_on"),
          db.from("document_requests").select("id, label_fr, label_en"),
        ]);
        if (cancelled) return;
        const found: Hit[] = [
          ...((cases.data ?? []) as { id: string; obligation_code: string; period_token: string }[]).map((c) => ({
            href: `${base}/declarations/${c.id}`,
            title: obligationLabel(c.obligation_code, locale),
            detail: c.period_token,
          })),
          ...((requests.data ?? []) as { id: string; label_fr: string; label_en: string }[]).map((r) => ({
            href: `${base}/requests`,
            title: locale === "fr" ? r.label_fr : r.label_en,
            detail: copy.nav.requests,
          })),
        ];
        catalogue.current = found;
      } catch {
        if (!cancelled) setBiz([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, copy.nav.requests, locale]);

  const name = biz.find((b) => b.id === activeId)?.legal_name ?? biz[0]?.legal_name ?? "—";
  const initial = name.trim().charAt(0).toUpperCase() || "K";

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalogue.current.filter((h) => `${h.title} ${h.detail}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  function active(href: string, exact?: boolean) {
    if (exact) return path === href;
    return path === href || path.startsWith(`${href}/`);
  }

  async function chooseBusiness(id: string) {
    setBizOpen(false);
    if (id === activeId) return;
    try {
      const raw = sessionStorage.getItem("kima.portal.session");
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      sessionStorage.setItem("kima.portal.session", JSON.stringify({ ...parsed, taxpayerId: id }));
    } catch {
      /* storage blocked — the list still closes */
    }
    setActiveId(id);
    router.refresh();
    window.location.assign(path);
  }

  const rest = path.split("/").slice(2).join("/");

  const linkClass = (on: boolean) =>
    `flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white ${
      on ? "bg-[#1B4E89] font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
    }`;

  const rail = (
    <div className="flex h-full flex-col bg-[#0D1B2A] text-white">
      <div className="px-5 pb-4 pt-6">
        <p className="font-display text-[1.35rem] font-bold leading-none tracking-tight">KiMA</p>
        <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-white/70">COMPLIANCE</p>
      </div>
      <nav aria-label={copy.menu} className="flex-1 overflow-y-auto px-3 pb-6">
        <ul className="flex flex-col gap-1">
          {nav.map((item) => {
            const on = active(item.href, item.exact);
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={on ? "page" : undefined} className={linkClass(on)} onClick={() => setOpen(false)}>
                  <Glyph name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );

  return (
    <div className="client-portal flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 lg:block">{rail}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label={copy.closeMenu} onClick={() => setOpen(false)} />
          <div className="relative h-full w-[240px] shadow-raised">{rail}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white px-3 sm:px-5">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-fg hover:bg-surface-sunken lg:hidden"
            aria-expanded={open}
            aria-label={copy.menu}
            onClick={() => setOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <div className="relative">
            <button
              type="button"
              aria-expanded={bizOpen}
              aria-haspopup="listbox"
              onClick={() => {
                setBizOpen((v) => !v);
                setLangOpen(false);
                setBellOpen(false);
              }}
              className="inline-flex min-h-[44px] max-w-[220px] items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium text-fg hover:bg-surface-sunken"
            >
              <span className="truncate">{name}</span>
              <Caret />
            </button>
            {bizOpen && (
              <ul role="listbox" aria-label={copy.account} className="absolute left-0 top-12 z-40 w-64 rounded-card border border-border bg-white p-1 shadow-raised">
                {biz.length === 0 && <li className="px-3 py-2 text-sm text-fg-muted">{copy.offline}</li>}
                {biz.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={b.id === (activeId ?? biz[0]?.id)}
                      onClick={() => void chooseBusiness(b.id)}
                      className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm hover:bg-surface-sunken"
                    >
                      {b.legal_name}
                    </button>
                  </li>
                ))}
                {biz.length <= 1 && biz.length > 0 && (
                  <li className="px-3 py-2 text-xs text-fg-muted">{copy.onlyBusiness}</li>
                )}
              </ul>
            )}
          </div>

          <div className="relative hidden min-w-0 flex-1 sm:block">
            <label className="relative block max-w-md">
              <span className="sr-only">{copy.searchLabel}</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m16 16 4 4" />
                </svg>
              </span>
              <input
                ref={searchRef}
                value={query}
                placeholder={copy.searchPlaceholder}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                className="min-h-[44px] w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle"
              />
            </label>
            {searchOpen && query.trim().length >= 2 && (
              <ul className="absolute left-0 top-12 z-40 w-full max-w-md rounded-card border border-border bg-white p-1 shadow-raised" role="listbox">
                {results.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-fg-muted">
                    {copy.searchEmpty}
                    <span className="mt-1 block text-xs">{copy.searchHint}</span>
                  </li>
                ) : (
                  results.map((hit) => (
                    <li key={`${hit.href}-${hit.title}`}>
                      <Link
                        href={hit.href}
                        className="flex min-h-[44px] flex-col justify-center rounded-lg px-3 hover:bg-surface-sunken"
                        onClick={() => {
                          setSearchOpen(false);
                          setQuery("");
                        }}
                      >
                        <span className="text-sm font-medium text-fg">{hit.title}</span>
                        <span className="text-xs text-fg-muted">{hit.detail}</span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <div className="relative">
              <button
                type="button"
                aria-expanded={langOpen}
                aria-label={copy.language}
                onClick={() => {
                  setLangOpen((v) => !v);
                  setBizOpen(false);
                  setBellOpen(false);
                }}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-fg hover:bg-surface-sunken"
              >
                {locale.toUpperCase()}
                <Caret />
              </button>
              {langOpen && (
                <ul className="absolute right-0 top-12 z-40 w-36 rounded-card border border-border bg-white p-1 shadow-raised">
                  {(["en", "fr"] as const).map((code) => (
                    <li key={code}>
                      <Link
                        href={`/${code}/${rest}`}
                        hrefLang={code}
                        className={`flex min-h-[44px] items-center rounded-lg px-3 text-sm hover:bg-surface-sunken ${
                          code === locale ? "font-semibold text-fg" : "text-fg-muted"
                        }`}
                      >
                        {code === "en" ? "English" : "Français"}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                aria-expanded={bellOpen}
                aria-label={unread > 0 ? `${copy.notifications}, ${unread} ${copy.unread}` : copy.notifications}
                onClick={() => {
                  setBellOpen((v) => !v);
                  setLangOpen(false);
                  setBizOpen(false);
                }}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-fg hover:bg-surface-sunken"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z" />
                  <path d="M10 19a2 2 0 0 0 4 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-text px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 top-12 z-40 w-64 rounded-card border border-border bg-white p-3 shadow-raised">
                  <p className="text-sm font-semibold text-fg">{copy.notifications}</p>
                  <p className="mt-1 text-sm text-fg-muted">
                    {unread > 0 ? `${unread} ${copy.unread}` : copy.notificationsEmpty}
                  </p>
                  <Link href={`${base}/messages`} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text hover:underline">
                    {copy.nav.messages}
                  </Link>
                </div>
              )}
            </div>

            <Link
              href={`${base}/profile`}
              aria-label={copy.nav.profile}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#1B4E89] text-sm font-semibold text-white hover:opacity-90"
            >
              {initial}
            </Link>
          </div>
        </header>

        <div className="border-b border-border bg-white px-4 py-3 sm:hidden">
          <label className="block">
            <span className="sr-only">{copy.searchLabel}</span>
            <input
              value={query}
              placeholder={copy.searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-border px-3 text-sm"
            />
          </label>
          {query.trim().length >= 2 && (
            <ul className="mt-2 flex flex-col" role="listbox">
              {results.length === 0 ? (
                <li className="py-2 text-sm text-fg-muted">{copy.searchEmpty}</li>
              ) : (
                results.map((hit) => (
                  <li key={`${hit.href}-${hit.title}`}>
                    <Link href={hit.href} className="flex min-h-[44px] flex-col justify-center" onClick={() => setQuery("")}>
                      <span className="text-sm font-medium">{hit.title}</span>
                      <span className="text-xs text-fg-muted">{hit.detail}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <main id="main" className="flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      <nav aria-label={copy.menu} className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white lg:hidden">
        <ul className="grid grid-cols-4">
          {[
            { href: base, label: copy.nav.dashboard, icon: "home" as const, exact: true },
            { href: `${base}/documents`, label: copy.nav.documents, icon: "folder" as const },
            { href: `${base}/messages`, label: copy.nav.messages, icon: "mail" as const },
            { href: `${base}/more`, label: copy.moreShort, icon: "clipboard" as const },
          ].map((item) => {
            const on = active(item.href, item.exact);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                    on ? "text-teal-text" : "text-fg-muted"
                  }`}
                >
                  <Glyph name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function Caret() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
