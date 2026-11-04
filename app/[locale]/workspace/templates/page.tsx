import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { TemplatesWorkspace } from "@/components/live/templates-workspace";

export default function TemplatesPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as "fr" | "en";
  const w = getWorkspaceDictionary(locale);
  return <TemplatesWorkspace locale={locale} t={w.firm.templates} />;
}
