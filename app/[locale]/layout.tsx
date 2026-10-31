import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../fonts.css";
import "../globals.css";
import { Footer } from "@/components/footer";
import { SiteFrame } from "@/components/site-frame";
import { ToastProvider } from "@/components/toast";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { getPublicCopy } from "@/lib/i18n-public";

/**
 * This is the root layout. Every route lives under the [locale] segment so that
 * `lang` on <html> is always correct for the page being read — a screen reader
 * must not announce French copy with an English voice.
 *
 * Poppins for headings, Inter for body — the specified pairing. IBM Plex Mono
 * stays for tabular XAF figures and account codes, because neither Poppins nor
 * Inter ships tabular-figure behaviour as reliably for columns of money.
 *
 * All three are served from this origin and declared in `app/fonts.css`, which
 * is where the latin/latin-ext split and the reason for it now live. They were
 * `next/font/google`, which made every build depend on reaching
 * fonts.gstatic.com and failed CI three times on 30 Oct in diffs that touched
 * no TypeScript.
 */

/** Unknown locales 404 at the router rather than rendering a shell first. */
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale: Locale = isLocale(params.locale) ? params.locale : "fr";
  const t = getDictionary(locale);
  const pub = getPublicCopy(locale);
  return {
    title: {
      default: `${t.brand} — ${t.proposition}`,
      template: `%s · ${t.brand}`,
    },
    description: pub.home.heroBody,
    alternates: {
      canonical: `/${locale}`,
      languages: { fr: "/fr", en: "/en" },
    },
    openGraph: {
      title: `${t.brand} — ${t.proposition}`,
      description: t.tagline,
      locale: locale === "fr" ? "fr_CM" : "en_CM",
      type: "website",
    },
  };
}

/**
 * Applied before first paint so a stored theme never flashes the other one.
 * Constant string, no interpolation of anything dynamic.
 */
const NO_FLASH = `try{var t=localStorage.getItem('kima-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="font-sans">
        <a href="#main" className="skip-link">
          {t.nav.skip}
        </a>
        <ToastProvider>
          <SiteFrame
            locale={locale}
            labels={{
              overview: t.nav.overview,
              taxpayer: t.nav.taxpayer,
              workspace: t.nav.workspace,
              design: t.nav.design,
              language: t.nav.language,
              mainNav: t.nav.mainNav,
              theme: t.nav.theme,
            }}
            footer={<Footer locale={locale} />}
          >
            {children}
          </SiteFrame>
        </ToastProvider>
      </body>
    </html>
  );
}
