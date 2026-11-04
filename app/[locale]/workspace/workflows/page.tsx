import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { PageHeading } from "@/components/ui";
import { WorkflowsBoard } from "@/components/live/workflows-board";

export default function WorkflowsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as "fr" | "en";
  const w = getWorkspaceDictionary(locale);
  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={w.firm.workflows.title} lede={w.firm.workflows.lede} />
      <WorkflowsBoard locale={locale} t={w.firm.workflows} />
    </div>
  );
}
