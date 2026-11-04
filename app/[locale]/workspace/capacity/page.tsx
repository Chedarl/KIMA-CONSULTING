import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CapacityWorkspace } from "@/components/live/capacity-workspace";

export default function CapacityPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as "fr" | "en";
  return <CapacityWorkspace locale={locale} />;
}
