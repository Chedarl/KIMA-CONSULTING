import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPortalDictionary } from "@/lib/i18n-portal";

/** Phone list for the routes that do not fit the bottom bar. */
export default function ClientMorePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const copy = getPortalDictionary(locale);
  const base = `/${locale}/app`;
  const links = [
    { href: `${base}/services`, label: copy.nav.services },
    { href: `${base}/requests`, label: copy.nav.requests },
    { href: `${base}/payments`, label: copy.nav.payments },
    { href: `${base}/calendar`, label: copy.nav.calendar },
    { href: `${base}/records`, label: copy.nav.records },
    { href: `${base}/profile`, label: copy.nav.profile },
    { href: `${base}/declarations`, label: copy.steps.documents },
    { href: `${base}/compliance`, label: copy.business },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[1.65rem] font-semibold text-fg">{copy.moreTitle}</h1>
      <p className="text-sm text-fg-muted">{copy.moreHint}</p>
      <ul className="flex flex-col gap-2">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-[52px] items-center rounded-card border border-border bg-white px-4 text-sm font-semibold text-fg shadow-card hover:shadow-raised"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
