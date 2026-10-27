import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ServicesBoard } from "@/components/client-portal/services-board";

export default function ServicesPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <ServicesBoard locale={params.locale} />;
}
