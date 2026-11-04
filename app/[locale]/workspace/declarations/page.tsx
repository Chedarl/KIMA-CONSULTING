import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Card, PageHeading } from "@/components/ui";

export default function ModuleSoonPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as "fr" | "en";
  const w = getWorkspaceDictionary(locale);
  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={w.firm.nav.declarations} lede={w.soon} />
      <Card>
        <div className="flex flex-col gap-2 p-6">
          <p className="text-sm text-fg-muted">
            {locale === "fr"
              ? "Ce module est en préparation. Le moteur n'est pas encore branché, donc rien n'est affiché ici plutôt qu'un écran vide ou faux."
              : "This module is in preparation. Its engine is not wired yet, so nothing is shown here rather than an empty or misleading screen."}
          </p>
        </div>
      </Card>
    </div>
  );
}
