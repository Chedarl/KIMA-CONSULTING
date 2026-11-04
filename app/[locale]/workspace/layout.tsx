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
import { LiveRefresh } from "@/components/live/live-refresh";
import { FreshOnFocus } from "@/components/live/fresh-on-focus";
import { SectionTabs, type TabSection } from "@/components/live/section-tabs";
import { WORKSPACE_SECTIONS } from "@/lib/workspace-nav";

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

  // Nine destinations, from lib/workspace-nav.ts. The screens that left the
  // rail are reached through the tab strip below the header, so nothing became
  // unreachable and no URL changed.
  const nav: NavItem[] = WORKSPACE_SECTIONS.map((section) => ({
    href: `${base}${section.path}`,
    label: locale === "fr" ? section.fr : section.en,
    icon: section.icon,
    ready: true,
  }));

  const tabSections: TabSection[] = WORKSPACE_SECTIONS.map((section) => ({
    key: section.key,
    path: section.path,
    tabs: section.tabs.map((tab) => ({
      href: `${base}${tab.path}`,
      label: (w.firm.nav as Record<string, string>)[tab.tabKey] ?? tab.tabKey,
      ready: tab.ready !== false,
    })),
  }));

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
      <LiveRefresh />
      <div className="mb-4 flex flex-col gap-3">
        <FirmSessionBar locale={locale} t={w.firmLogin} />
        <SectionTabs
          base={base}
          sections={tabSections}
          label={locale === "fr" ? "Pages de cette rubrique" : "Pages in this section"}
        />
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
      <FreshOnFocus>{children}</FreshOnFocus>
    </Shell>
    </ThemeRoot>
  );
}
