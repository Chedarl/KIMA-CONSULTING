import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { CopilotWorkspace } from "@/components/live/copilot-workspace";

export default function AiPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as "fr" | "en";
  const w = getWorkspaceDictionary(locale);
  return <CopilotWorkspace locale={locale} t={w.firm.copilot} />;
}
