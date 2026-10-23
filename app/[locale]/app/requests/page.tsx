import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { RequestsBoard } from "@/components/client-portal/requests-board";

export default function RequestsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <RequestsBoard locale={params.locale} />;
}
