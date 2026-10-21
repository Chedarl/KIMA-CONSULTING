import type { Metadata } from "next";
import { Inter, Poppins, IBM_Plex_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import { Chrome } from "@/components/chrome";
import { Footer } from "@/components/footer";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";

/**
 * This is the root layout. Every route lives under the [locale] segment so that
 * `lang` on <html> is always correct for the page being read — a screen reader
 * must not announce French copy with an English voice.
 *
 * Poppins for headings, Inter for body — the specified pairing. IBM Plex Mono
 * stays for tabular XAF figures and account codes, because neither Poppins nor
 * Inter ships tabular-figure behaviour as reliably for columns of money.
 *
 * Both subsets include latin-ext so French diacritics render from the webfont
 * rather than falling back mid-word.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

/** Unknown locales 404 at the router rather than rendering a shell first. */
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale: Locale = isLocale(params.locale) ? params.locale : "fr";
  const t = getDictionary(locale);
  return {
    title: {
      default: `${t.brand} — ${t.proposition}`,
      template: `%s · ${t.brand}`,
    },
    description: t.home.heroBody,
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
      <body className={`${inter.variable} ${poppins.variable} ${plexMono.variable} font-sans`}>
        <a href="#main" className="skip-link">
          {t.nav.skip}
        </a>
        <Chrome
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
        />
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          {children}
        </main>
        <Footer locale={locale} />
      </body>
    </html>
  );
}
