import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { HomePage } from "@/components/marketing/home-page";

/** Public marketing homepage. Firm and client shells are other routes. */
export default function OverviewPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <HomePage locale={params.locale} />;
}
