import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { EngagementLetters } from "@/components/client-portal/engagement-letters";

/** The terms, and the one place a client agrees to them. */
export default function EngagementPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <EngagementLetters locale={params.locale} />;
}
