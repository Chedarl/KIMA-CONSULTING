"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Chrome, type ChromeLabels } from "@/components/chrome";
import type { Locale } from "@/lib/i18n";

/**
 * Marketing chrome wraps every public route. The client portal brings its own
 * shell, so those routes render full-bleed. Firm workspace keeps the site header.
 */
export function SiteFrame({
  locale,
  labels,
  footer,
  children,
}: {
  locale: Locale;
  labels: ChromeLabels;
  footer: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname() || "";
  const portal = path === `/${locale}/app` || path.startsWith(`/${locale}/app/`);
  if (portal) return <>{children}</>;
  return (
    <>
      <Chrome locale={locale} labels={labels} />
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        {children}
      </main>
      {footer}
    </>
  );
}
