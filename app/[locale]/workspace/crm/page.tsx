import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CrmContacts } from "@/components/live/crm-contacts";

/**
 * Contacts: the people, as their own object.
 *
 * Copy sits here rather than in the workspace dictionary because these strings
 * have one caller. Both languages are side by side so parity is visible.
 */
export default function CrmPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const fr = params.locale === "fr";

  return (
    <div>
      <h1 className="font-display text-lg font-semibold text-fg">Contacts</h1>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        {fr
          ? "Les personnes, et les dossiers fiscaux auxquels elles sont rattachées. Une même personne peut en détenir plusieurs : l'accès au portail se donne dossier par dossier."
          : "The people, and the tax files they are attached to. One person may hold several: portal access is granted file by file."}
      </p>
      <div className="mt-5">
        <CrmContacts
          locale={params.locale}
          t={{
            title: fr ? "Contacts du cabinet" : "Firm contacts",
            search: fr ? "Rechercher un nom ou un e-mail" : "Search a name or an email",
            empty: fr ? "Aucun contact" : "No contacts",
            emptyHint: fr
              ? "Les personnes ajoutées à un dossier client apparaissent ici."
              : "People added to a client file appear here.",
            offline: fr
              ? "Connexion indisponible — rien n'est affiché plutôt qu'un carnet périmé."
              : "Connection unavailable — nothing is shown rather than a stale address book.",
            loading: fr ? "Chargement…" : "Loading…",
            colName: fr ? "Personne" : "Person",
            colFiles: fr ? "Dossiers fiscaux" : "Tax files",
            colAccess: fr ? "Accès portail" : "Portal access",
            colReach: fr ? "Coordonnées" : "Contact details",
            noFiles: fr ? "Aucun dossier lié" : "No linked file",
            primary: fr ? "Principal" : "Primary",
            portalOn: fr ? "Actif" : "Active",
            portalOff: fr ? "Aucun" : "None",
            countOne: fr ? "personne" : "person",
            countMany: fr ? "personnes" : "people",
            relationship: {
              owner: fr ? "Propriétaire" : "Owner",
              director: fr ? "Dirigeant" : "Director",
              employee: fr ? "Salarié" : "Employee",
              accountant: fr ? "Comptable" : "Accountant",
              self: fr ? "Elle-même" : "Themselves",
              contact: fr ? "Contact" : "Contact",
            },
          }}
        />
      </div>
    </div>
  );
}
