"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Chrome, type ChromeLabels } from "@/components/chrome";
import type { Locale } from "@/lib/i18n";

/**
 * Three shells, three boundaries.
 *
 * The client portal brings its own shell. The firm workspace and the design
 * page keep the existing site header — those screens are not part of the
 * public redesign. Marketing, sign-in and onboarding are full-bleed and bring
 * their own header.
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

  const firmChrome =
    path === `/${locale}/workspace` ||
    path.startsWith(`/${locale}/workspace/`) ||
    path === `/${locale}/design` ||
    path.startsWith(`/${locale}/design/`) ||
    path === `/${locale}/firm-login` ||
    path.startsWith(`/${locale}/firm-login/`);

  if (!firmChrome) {
    return <div className="public-site">{children}</div>;
  }

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
