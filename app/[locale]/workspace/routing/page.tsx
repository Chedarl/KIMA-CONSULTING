import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { UnassignedRegistrations } from "@/components/live/unassigned-registrations";

/** Read-only queue of applications no firm was given. Routing actions are not here. */
export default function RoutingPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const fr = params.locale === "fr";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-lg font-semibold text-fg">
          {fr ? "Demandes non attribuées" : "Unassigned applications"}
        </h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          {fr
            ? "Ces demandes n'ont pas de cabinet. Seules les informations utiles au routage sont affichées. Aucun dossier client n'est ouvert ici."
            : "These applications have no firm. Only the details needed for routing are shown. No client file is opened here."}
        </p>
      </div>
      <UnassignedRegistrations locale={fr ? "fr" : "en"} />
    </div>
  );
}
