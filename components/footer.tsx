import { getDictionary, type Locale } from "@/lib/i18n";

/**
 * Server component, deliberately separate from `chrome.tsx`.
 *
 * The footer has no interactivity, so keeping it out of the client module means
 * its strings — and the dictionary it reads them from — never reach the browser
 * bundle. On a slow Cameroonian connection that matters.
 */
export function Footer({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-fg-muted">
        <p className="font-semibold text-fg">{t.company}</p>
        <p className="mt-1">{t.tagline}</p>
        <p className="mt-3 text-xs text-fg-subtle">{t.footer.disclaimer}</p>
      </div>
    </footer>
  );
}
