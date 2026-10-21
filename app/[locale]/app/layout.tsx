import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Shell, type NavItem } from "@/components/shell";

/**
 * The client workspace shell. Modules that do not exist yet appear in the rail
 * as disabled items rather than links that 404 — see components/shell.tsx.
 */
export default function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const w = getWorkspaceDictionary(locale);
  const base = `/${locale}/app`;

  const nav: NavItem[] = [
    { href: base, label: w.client.nav.dashboard, icon: "grid", ready: true },
    { href: `${base}/compliance`, label: w.client.nav.compliance, icon: "shield", ready: true },
    { href: `${base}/documents`, label: w.client.nav.documents, icon: "folder", ready: true },
    { href: `${base}/declarations`, label: w.client.nav.declarations, icon: "file", ready: true },
    { href: `${base}/archive`, label: w.client.nav.archive, icon: "archive", ready: true },
    { href: `${base}/messages`, label: w.client.nav.messages, icon: "chat", ready: false },
    { href: `${base}/payments`, label: w.client.nav.payments, icon: "card", ready: false },
    { href: `${base}/support`, label: w.client.nav.support, icon: "help", ready: false },
    { href: `${base}/profile`, label: w.client.nav.profile, icon: "user", ready: false },
  ];

  return (
    <Shell
      nav={nav}
      title={w.client.title}
      subtitle={w.client.subtitle}
      soonLabel={w.soon}
      menuLabel={w.menu}
    >
      {children}
    </Shell>
  );
}
