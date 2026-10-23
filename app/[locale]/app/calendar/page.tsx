import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CalendarBoard } from "@/components/client-portal/calendar-board";

export default function ClientCalendarPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <CalendarBoard locale={params.locale} />;
}
