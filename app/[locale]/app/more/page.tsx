import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";

/**
 * The rest of the client portal, one tap from the phone bar.
 * Each link is a screen that already exists.
 */
export default function ClientMorePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const w = getWorkspaceDictionary(locale);
  const base = `/${locale}/app`;
  const links = [
    { href: `${base}/compliance`, label: w.client.nav.compliance },
    { href: `${base}/declarations`, label: w.client.nav.declarations },
    { href: `${base}/archive`, label: w.client.nav.archive },
    { href: `${base}/payments`, label: w.client.nav.payments },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">{w.client.moreTitle}</h1>
        <p className="mt-1 text-sm text-fg-muted">{w.client.moreHint}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-[52px] items-center rounded-card border border-border bg-surface px-4 text-sm font-semibold text-fg"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
