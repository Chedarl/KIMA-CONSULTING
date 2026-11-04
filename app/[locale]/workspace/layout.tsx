import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Shell, type NavItem } from "@/components/shell";
import { FirmSearch } from "@/components/live/firm-search";
import { FirmSessionBar } from "@/components/live/firm-session-bar";
import { KimaAssistant } from "@/components/live/kima-assistant";
import { CommandPalette } from "@/components/live/command-palette";
import { ThemeRoot } from "@/components/theme-root";

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
    { href: `${base}/routing`, label: w.firm.nav.routing, icon: "inbox", ready: true },
    { href: `${base}/clients`, label: w.firm.nav.clients, icon: "people", ready: true },
    { href: `${base}/workflows`, label: w.firm.nav.workflows, icon: "queue", ready: true },
    { href: `${base}/staff`, label: w.firm.nav.staff, icon: "people", ready: true },
    { href: `${base}/engagements`, label: w.firm.nav.engagements, icon: "folder", ready: true },
    { href: `${base}/queue`, label: w.firm.nav.queue, icon: "queue", ready: true },
    { href: `${base}/tasks`, label: w.firm.nav.tasks, icon: "check", ready: true },
    { href: `${base}/incidents`, label: w.firm.nav.incidents, icon: "shield", ready: true },
    { href: `${base}/dsf`, label: w.firm.nav.dsf, icon: "file", ready: true },
    { href: `${base}/kyc`, label: w.firm.nav.kyc, icon: "shield", ready: true },
    { href: `${base}/inbox`, label: w.firm.nav.inbox, icon: "inbox", ready: true },
    { href: `${base}/cases`, label: w.firm.nav.cases, icon: "file", ready: true },
    { href: `${base}/reviews`, label: w.firm.nav.reviews, icon: "check", ready: true },
    { href: `${base}/messages`, label: w.firm.nav.messages, icon: "chat", ready: true },
    { href: `${base}/filing`, label: w.firm.nav.filing, icon: "archive", ready: true },
    { href: `${base}/declarations`, label: w.firm.nav.declarations, icon: "file", ready: false },
    { href: `${base}/calendar`, label: w.firm.nav.calendar, icon: "calendar", ready: true },
    { href: `${base}/vault`, label: w.firm.nav.vault, icon: "archive", ready: true },
    { href: `${base}/billing`, label: w.firm.nav.billing, icon: "card", ready: true },
    { href: `${base}/time`, label: locale === "fr" ? "Temps" : "Time", icon: "chart", ready: true },
    { href: `${base}/capacity`, label: locale === "fr" ? "Capacité" : "Capacity", icon: "people", ready: true },
    { href: `${base}/reports`, label: w.firm.nav.reports, icon: "chart", ready: false },
    { href: `${base}/settings`, label: w.firm.nav.admin, icon: "cog", ready: true },
    { href: `${base}/branding`, label: w.firm.nav.branding, icon: "chart", ready: true },
    { href: `${base}/templates`, label: w.firm.nav.templates, icon: "folder", ready: true },
    { href: `${base}/ai`, label: w.firm.nav.ai, icon: "chat", ready: true },
  ];

  return (
    <ThemeRoot>
    <Shell
      nav={nav}
      title={w.firm.title}
      subtitle={w.firm.subtitle}
      soonLabel={w.soon}
      menuLabel={w.menu}
      tone="navy"
    >
      <div className="mb-4 flex flex-col gap-3">
        <FirmSessionBar locale={locale} t={w.firmLogin} />
        <KimaAssistant locale={locale} t={w.firm.kima} />
        <CommandPalette
          locale={locale}
          nav={nav.filter((n) => n.ready !== false).map((n) => ({ href: n.href, label: n.label }))}
          labels={{
            placeholder: w.firm.cmdPlaceholder,
            groupNavigate: w.firm.cmdGroupNavigate,
            groupCases: w.firm.cmdGroupCases,
            noResults: w.firm.cmdNoResults,
            hint: w.firm.cmdHint,
          }}
        />
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
    </ThemeRoot>
  );
}
