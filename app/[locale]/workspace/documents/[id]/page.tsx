import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DocumentReview } from "@/components/live/document-review";

export default function DocumentPage({ params }: { params: { locale: string; id: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as "fr" | "en";
  const w = getWorkspaceDictionary(locale);
  return <DocumentReview docId={params.id} locale={locale} t={w.firm.documentReview} />;
}
