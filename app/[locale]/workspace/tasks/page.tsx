import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { WorkTasks } from "@/components/live/work-tasks";

export default function TasksPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{w.tasks.title}</h2>
        <p className="text-sm text-fg-muted">{w.tasks.subtitle}</p>
      </div>
      <WorkTasks t={w.tasks} />
    </div>
  );
}
