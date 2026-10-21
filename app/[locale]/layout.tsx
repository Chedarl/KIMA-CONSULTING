import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import { Chrome, Footer } from "@/components/chrome";
import { getDictionary, isLocale, locales } from "@/lib/i18n";

/**
 * This is the root layout. Every route lives under the [locale] segment so that
 * `lang` on <html> is always correct for the page being read — a screen reader
 * must not announce French copy with an English voice.
 *
 * IBM Plex Sans is the "Financial Trust" pairing: a fintech face with full
 * French diacritic coverage, plus a mono companion for tabular XAF figures.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KIMA Compliance OS",
  description:
    "Tax compliance management for businesses and accounting firms in Cameroon. Interface prototype.",
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

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
      <body className={`${plexSans.variable} ${plexMono.variable} font-sans`}>
        <a href="#main" className="skip-link">
          {t.nav.skip}
        </a>
        <Chrome locale={locale} />
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          {children}
        </main>
        <Footer locale={locale} />
      </body>
    </html>
  );
}
