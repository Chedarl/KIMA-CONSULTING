import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Shell, type NavItem } from "@/components/shell";

/**
 * The firm workspace shell — twelve modules, of which the first release builds
 * a few. The rest are visible but disabled, so the shape of the product stays
 * legible without pretending the modules exist.
 */
export default function FirmLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const w = getWorkspaceDictionary(locale);
  const base = `/${locale}/workspace`;

  const nav: NavItem[] = [
    { href: base, label: w.firm.nav.overview, icon: "grid", ready: true },
    { href: `${base}/clients`, label: w.firm.nav.clients, icon: "people", ready: true },
    { href: `${base}/inbox`, label: w.firm.nav.inbox, icon: "inbox", ready: true },
    { href: `${base}/filing`, label: w.firm.nav.filing, icon: "archive", ready: true },
    { href: `${base}/queue`, label: w.firm.nav.queue, icon: "queue", ready: true },
    { href: `${base}/declarations`, label: w.firm.nav.declarations, icon: "file", ready: false },
    { href: `${base}/calendar`, label: w.firm.nav.calendar, icon: "calendar", ready: false },
    { href: `${base}/reviews`, label: w.firm.nav.reviews, icon: "check", ready: true },
    { href: `${base}/messages`, label: w.firm.nav.messages, icon: "chat", ready: true },
    { href: `${base}/vault`, label: w.firm.nav.vault, icon: "archive", ready: false },
    { href: `${base}/billing`, label: w.firm.nav.billing, icon: "card", ready: false },
    { href: `${base}/reports`, label: w.firm.nav.reports, icon: "chart", ready: false },
    { href: `${base}/admin`, label: w.firm.nav.admin, icon: "cog", ready: false },
  ];

  return (
    <Shell
      nav={nav}
      title={w.firm.title}
      subtitle={w.firm.subtitle}
      soonLabel={w.soon}
      menuLabel={w.menu}
    >
      <div className="mb-3 flex justify-end">
        <a
          href={`/${locale}/firm-login`}
          className="min-h-[44px] inline-flex items-center text-sm font-semibold text-navy hover:underline"
        >
          {w.firmLogin.title}
        </a>
      </div>
      {children}
    </Shell>
  );
}
