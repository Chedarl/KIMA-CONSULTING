import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { FilingFramework } from "@/components/live/filing-framework";

/**
 * The filing framework.
 *
 * Not a settings page — there is nothing to configure. The naming grammar and
 * the folder tree are derived from the rules in force and from each client's own
 * obligations, so this page explains and demonstrates rather than asking the
 * practitioner to build anything.
 *
 * No demo banner: nothing here touches client data. Every value on the page is
 * computed from a worked example by pure functions in `lib/document-naming.ts`.
 */
export default function FilingPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.filing.title}</h2>
        <p className="text-sm text-fg-muted">{w.filing.subtitle}</p>
      </div>

      <FilingFramework locale={locale} t={w.filing} />
    </div>
  );
}
