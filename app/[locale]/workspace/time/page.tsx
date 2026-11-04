import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { TimeWorkspace } from "@/components/live/time-workspace";

export default function TimePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as "fr" | "en";
  return <TimeWorkspace locale={locale} />;
}
