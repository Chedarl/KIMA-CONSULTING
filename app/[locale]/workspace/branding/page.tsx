import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { BrandStudio } from "@/components/live/brand-studio";

export default function BrandingPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as "fr" | "en";
  const w = getWorkspaceDictionary(locale);
  return <BrandStudio t={w.firm.branding} />;
}
