import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { DeadlineCalendar } from "@/components/live/deadline-calendar";

/** Firm deadlines. Each date says whether it is statutory, prorogued, or unconfirmed. */
export default function CalendarPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h1 className="font-display text-lg font-semibold text-fg">{w.deadlineCalendar.title}</h1>
        <p className="text-sm text-fg-muted">{w.deadlineCalendar.subtitle}</p>
      </div>
      <DeadlineCalendar locale={locale} t={w.deadlineCalendar} />
    </div>
  );
}
