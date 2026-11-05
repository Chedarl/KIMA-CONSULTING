import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { ApplicantFirmSuggestion } from "@/components/marketing/firm-suggestion";

/** Signed-in return path. A suggestion is not visible on the anonymous ready step. */
export default function SuggestionPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale: Locale = params.locale;
  return (
    <section className="mx-auto max-w-lg px-4 py-8">
      <h1 className="font-display text-2xl font-bold text-fg">
        {locale === "fr" ? "Cabinet proposé" : "Suggested firm"}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        {locale === "fr"
          ? "Accepter nomme le cabinet. Cela n'ouvre pas de dossier et ne crée pas d'engagement."
          : "Accepting names the firm. It does not open a file and it does not create an engagement."}
      </p>
      <ApplicantFirmSuggestion locale={locale} />
    </section>
  );
}
