import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Shell, type NavItem } from "@/components/shell";
import { FirmSearch } from "@/components/live/firm-search";
import { FirmSessionBar } from "@/components/live/firm-session-bar";
import { VendorRoutingLink } from "@/components/live/vendor-routing-link";

/**
 * Firm workspace chrome.
 *
 * Modules without an engine stay visible and disabled. Engagements, the
 * vault and billing open onto the ledgers that already exist. Declarations,
 * reports and settings stay closed until those engines do.
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
    { href: `${base}/leads`, label: w.firm.nav.leads, icon: "user", ready: true },
    { href: `${base}/clients`, label: w.firm.nav.clients, icon: "people", ready: true },
    { href: `${base}/staff`, label: w.firm.nav.staff, icon: "people", ready: true },
    { href: `${base}/engagements`, label: w.firm.nav.engagements, icon: "folder", ready: true },
    { href: `${base}/queue`, label: w.firm.nav.queue, icon: "queue", ready: true },
    { href: `${base}/inbox`, label: w.firm.nav.inbox, icon: "inbox", ready: true },
    { href: `${base}/cases`, label: w.firm.nav.cases, icon: "file", ready: true },
    { href: `${base}/reviews`, label: w.firm.nav.reviews, icon: "check", ready: true },
    { href: `${base}/messages`, label: w.firm.nav.messages, icon: "chat", ready: true },
    { href: `${base}/filing`, label: w.firm.nav.filing, icon: "archive", ready: true },
    { href: `${base}/declarations`, label: w.firm.nav.declarations, icon: "file", ready: false },
    { href: `${base}/calendar`, label: w.firm.nav.calendar, icon: "calendar", ready: true },
    { href: `${base}/vault`, label: w.firm.nav.vault, icon: "archive", ready: true },
    { href: `${base}/billing`, label: w.firm.nav.billing, icon: "card", ready: true },
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
      tone="navy"
      extraNav={<VendorRoutingLink href={`${base}/routing`} label={w.firm.nav.routing} />}
    >
      <div className="mb-4 flex flex-col gap-3">
        <FirmSessionBar locale={locale} t={w.firmLogin} />
        <div className="flex flex-wrap items-center gap-3">
          <FirmSearch
            locale={locale}
            labels={{
              searchLabel: w.firm.searchLabel,
              searchPlaceholder: w.firm.searchPlaceholder,
              searchEmpty: w.firm.searchEmpty,
              searchClients: w.firm.searchClients,
              searchCases: w.firm.searchCases,
              signedOut: w.firmLogin.signedOut,
            }}
          />
          <Link
            href={`${base}/clients`}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90"
          >
            + {w.firm.newClient}
          </Link>
        </div>
      </div>
      {children}
    </Shell>
  );
}
