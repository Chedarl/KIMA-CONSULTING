/**
 * French and English must reach parity on every core journey (Scenario I), so
 * strings live here rather than inline, and the dictionary is typed: adding a
 * key to `fr` without adding it to `en` is a type error.
 *
 * French is the default for Cameroon.
 */

export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

const fr = {
  brand: "KIMA Compliance OS",
  company: "Kima Consulting",
  tagline: "Vos comptes en ordre. Vos obligations maîtrisées.",
  proposition: "Votre partenaire en conformité fiscale",
  nav: {
    overview: "Présentation",
    taxpayer: "Espace client",
    workspace: "Espace cabinet",
    design: "Système de design",
    language: "Langue",
    skip: "Aller au contenu principal",
    mainNav: "Navigation principale",
    theme: "Changer de thème",
  },
  home: {
    heroTitle: "Comprenez vos impôts. Organisez vos pièces. Restez prêt.",
    heroBody:
      "Kima réunit les contribuables et leurs comptables dans un même espace : collecte des pièces, suivi des obligations, préparation des déclarations et archivage probant.",
    ctaPrimary: "Voir l'espace client",
    ctaSecondary: "Voir l'espace cabinet",
    demoNotice:
      "Prototype d'interface. Données de démonstration uniquement — aucun dossier réel, aucune valeur fiscale calculée, aucune intégration avec la DGI.",
    pillarsTitle: "Ce qui distingue Kima",
    pillars: [
      {
        title: "La conformité d'abord",
        body: "Chaque écran s'organise autour des obligations du contribuable, pas autour des journaux comptables.",
      },
      {
        title: "Transparence des deux côtés",
        body: "Le cabinet gère le travail technique ; le contribuable voit où en est son dossier et pourquoi.",
      },
      {
        title: "Historique probant",
        body: "Chaque obligation close conserve ses pièces, sa revue et sa preuve de dépôt.",
      },
    ],
    previewCaption: "Espace client — aperçu",
    pathTitle: "Par où commencer",
    paths: [
      {
        eyebrow: "Je suis un contribuable",
        title: "Suivez votre dossier sans relancer personne",
        body: "Une seule action à la fois, la liste de ce qui manque, et l'avancement de votre déclaration en langage clair.",
        cta: "Ouvrir l'espace client",
      },
      {
        eyebrow: "Je suis un cabinet",
        title: "Pilotez tout votre portefeuille",
        body: "Échéances à risque, file de revue des pièces, préparation DSF et approbation par un réviseur qualifié.",
        cta: "Ouvrir l'espace cabinet",
      },
    ],
    proofTitle: "Conçu pour le terrain camerounais",
    proof: [
      { value: "FR / EN", label: "Parité complète sur chaque parcours" },
      { value: "15.03 · 15.04 · 15.05", label: "Échéances DSF selon le centre des impôts" },
      { value: "XAF", label: "Francs entiers, jamais de centimes" },
      { value: "Preuve", label: "Chaque obligation close conserve sa preuve de dépôt" },
    ],
    areasTitle: "Six domaines connectés",
    areas: [
      { name: "Kima Client", body: "Le portail du contribuable." },
      { name: "Kima Workspace", body: "Le poste de travail du cabinet." },
      { name: "Kima DSF Bridge", body: "De la balance Sage à la DSF, traçable." },
      { name: "Kima Compliance Radar", body: "Obligations, échéances et alertes." },
      { name: "Kima Clarity AI", body: "Réponses sourcées, jamais inventées." },
      { name: "Kima Evidence Vault", body: "L'archive probante, année par année." },
    ],
  },
  taxpayer: {
    greeting: "Bonjour Mme Ngo Bakang",
    entity: "Boulangerie Le Palmier SARL",
    nextActionLabel: "Votre prochaine action",
    nextAction: "Transmettre le relevé bancaire de septembre",
    nextActionWhy:
      "Votre comptable en a besoin pour rapprocher les encaissements avant de préparer la déclaration.",
    nextActionCta: "Déposer le document",
    documentsTitle: "Pièces demandées",
    received: "Reçu",
    missing: "Manquant",
    responsibleYou: "À vous",
    responsibleFirm: "Au cabinet",
    obligationsTitle: "Vos obligations",
    progressTitle: "Avancement de votre déclaration",
    activityTitle: "Activité récente",
    assignedTo: "Votre comptable",
    dueIn: (days: number) => `dans ${days} jours`,
    overdueBy: (days: number) => `en retard de ${days} jours`,
  },
  workspace: {
    title: "Portefeuille",
    subtitle: "12 clients · 3 échéances à risque",
    queueTitle: "File de revue des pièces",
    clientsTitle: "Déclarations en cours",
    reviewTitle: "À approuver",
    client: "Client",
    obligation: "Obligation",
    period: "Période",
    due: "Échéance",
    completeness: "Pièces",
    status: "Statut",
    preparedBy: "Préparé par",
    reviewer: "Réviseur",
    amount: "Montant",
    openReview: "Ouvrir la revue",
    poolReviewer: "Réviseur du pool Kima",
    noSelfApproval:
      "Le préparateur ne peut pas approuver son propre travail. Ce dossier est assigné à un réviseur qualifié.",
    taxCentre: "Centre des impôts",
  },
  status: {
    confirmed: "Confirmé",
    draft: "Brouillon",
    estimated: "Estimé",
    awaitingReview: "En attente de revue",
    filed: "Déposé",
    actionNeeded: "Action requise",
    confirmedHelp: "Valeur vérifiée, adossée à une pièce.",
    draftHelp: "Saisie en cours, non revue.",
    estimatedHelp: "Estimation indicative, non opposable.",
    awaitingReviewHelp: "Préparé, en attente d'un réviseur qualifié.",
    filedHelp: "Déposé, preuve de dépôt au dossier.",
    actionNeededHelp: "Une action de votre part est attendue.",
    awaitingEvidence: "Dépôt non confirmé",
    awaitingEvidenceHelp: "Transmis, mais sans accusé de réception au dossier.",
  },
  footer: {
    disclaimer:
      "Prototype d'interface — aucune autorisation, aucun partenariat et aucune intégration de télédéclaration avec la DGI n'est établi ou revendiqué.",
  },
  work: {
    myDay: "À faire",
    overdue: "En retard",
    today: "Aujourd'hui",
    soon: "Sous 7 jours",
    later: "Plus tard",
    nothingDue: "Rien ne vous attend pour l'instant.",
    openRequests: "Demandes ouvertes",
    request: {
      requested: "Demandé",
      in_progress: "En cours",
      in_client_review: "À valider",
      returned: "Retourné",
      submitted: "Transmis",
      accepted: "Accepté",
    },
    metrics: {
      atRisk: "Échéances à risque",
      avgOverdue: "Retard moyen",
      onTime: "Déposées dans les délais",
      returnedTwice: "Retournées plus d'une fois",
      clients: "Clients",
      days: "j",
      returnedHint: "Mesure notre clarté, pas la diligence du client.",
    },
    mine: "Moi",
    firm: "Tout le cabinet",
    evidence: "Preuve",
    demoDates: "Dates de démonstration, non vérifiées",
    boundTo: "Rattaché",
    unbound: "À rattacher",
    unknownClient: "Client inconnu",
    viaLink: "lien",
    viaEmail: "courriel",
  },
  design: {
    title: "Système de design",
    intro:
      "Jetons, typographie et composants dérivés de la section 9 du cahier des charges. Chaque couleur de marque est distincte de sa couleur de texte, pour tenir le contraste de 4,5:1.",
    colours: "Couleurs",
    typography: "Typographie",
    statusHonesty: "Honnêteté des états",
    statusHonestyBody:
      "L'interface doit distinguer visiblement une information confirmée, un calcul provisoire, un risque estimé et un travail en attente de revue. La couleur ne suffit jamais : chaque état porte aussi une forme et un libellé.",
    components: "Composants",
    money: "Montants",
    moneyBody:
      "Le franc CFA ne connaît pas de centimes. Les montants sont stockés en francs entiers et alignés en chiffres tabulaires.",
    density: "Densité",
    densityBody:
      "Deux densités, un seul jeu de jetons : l'espace client respire et se lit sur mobile, l'espace cabinet affiche le maximum d'information utile.",
    textColour: "Texte",
    fillColour: "Remplissage",
  },
  common: {
    viewAll: "Tout voir",
    demoData: "Données de démonstration",
    xaf: "FCFA",
    prototype: "Prototype",
  },
};

/**
 * Shape derived from the French dictionary, with strings left wide: `en` must
 * supply every key, but obviously not the same text. Marking `fr` `as const`
 * would freeze each string into a literal type and make translation a type
 * error.
 */
type Dictionary = typeof fr;

const en: Dictionary = {
  brand: "KIMA Compliance OS",
  company: "Kima Consulting",
  tagline: "Clear Records. Confident Compliance.",
  proposition: "Your Tax Compliance Partner",
  nav: {
    overview: "Overview",
    taxpayer: "Client portal",
    workspace: "Firm workspace",
    design: "Design system",
    language: "Language",
    skip: "Skip to main content",
    mainNav: "Main navigation",
    theme: "Switch theme",
  },
  home: {
    heroTitle: "Understand your taxes. Organize your records. Stay ready.",
    heroBody:
      "Kima brings taxpayers and their accountants into one place: collecting documents, tracking obligations, preparing declarations and keeping the evidence.",
    ctaPrimary: "See the client portal",
    ctaSecondary: "See the firm workspace",
    demoNotice:
      "Interface prototype. Demonstration data only — no real client files, no computed tax values, no DGI integration.",
    pillarsTitle: "What makes Kima different",
    pillars: [
      {
        title: "Compliance first",
        body: "Every screen is organized around the taxpayer's obligations rather than around accounting journals.",
      },
      {
        title: "Two-sided transparency",
        body: "The firm does the technical work; the taxpayer sees where their file stands and why.",
      },
      {
        title: "Evidence-based history",
        body: "Every completed obligation keeps its documents, its review record and its proof of filing.",
      },
    ],
    previewCaption: "Client portal — preview",
    pathTitle: "Where to start",
    paths: [
      {
        eyebrow: "I am a taxpayer",
        title: "Follow your file without chasing anyone",
        body: "One action at a time, a list of what is still missing, and your declaration's progress in plain language.",
        cta: "Open the client portal",
      },
      {
        eyebrow: "I am an accounting firm",
        title: "Run your whole portfolio",
        body: "Deadlines at risk, the document review queue, DSF preparation and approval by a qualified reviewer.",
        cta: "Open the firm workspace",
      },
    ],
    proofTitle: "Built for Cameroonian conditions",
    proof: [
      { value: "FR / EN", label: "Full parity on every journey" },
      { value: "15.03 · 15.04 · 15.05", label: "DSF deadlines by tax centre" },
      { value: "XAF", label: "Whole francs, never centimes" },
      { value: "Evidence", label: "Every closed obligation keeps its proof of filing" },
    ],
    areasTitle: "Six connected areas",
    areas: [
      { name: "Kima Client", body: "The taxpayer's portal." },
      { name: "Kima Workspace", body: "The firm's operating system." },
      { name: "Kima DSF Bridge", body: "Sage balance to DSF, traceable." },
      { name: "Kima Compliance Radar", body: "Obligations, deadlines and alerts." },
      { name: "Kima Clarity AI", body: "Sourced answers, never invented." },
      { name: "Kima Evidence Vault", body: "The evidence archive, year by year." },
    ],
  },
  taxpayer: {
    greeting: "Good morning, Ms Ngo Bakang",
    entity: "Boulangerie Le Palmier SARL",
    nextActionLabel: "Your next action",
    nextAction: "Send the September bank statement",
    nextActionWhy:
      "Your accountant needs it to reconcile receipts before preparing the declaration.",
    nextActionCta: "Upload the document",
    documentsTitle: "Requested documents",
    received: "Received",
    missing: "Missing",
    responsibleYou: "With you",
    responsibleFirm: "With the firm",
    obligationsTitle: "Your obligations",
    progressTitle: "Your declaration's progress",
    activityTitle: "Recent activity",
    assignedTo: "Your accountant",
    dueIn: (days: number) => `in ${days} days`,
    overdueBy: (days: number) => `${days} days overdue`,
  },
  workspace: {
    title: "Portfolio",
    subtitle: "12 clients · 3 deadlines at risk",
    queueTitle: "Document review queue",
    clientsTitle: "Declarations in progress",
    reviewTitle: "Awaiting approval",
    client: "Client",
    obligation: "Obligation",
    period: "Period",
    due: "Due",
    completeness: "Documents",
    status: "Status",
    preparedBy: "Prepared by",
    reviewer: "Reviewer",
    amount: "Amount",
    openReview: "Open review",
    poolReviewer: "Kima pool reviewer",
    noSelfApproval:
      "A preparer cannot approve their own work. This file is assigned to a qualified reviewer.",
    taxCentre: "Tax centre",
  },
  status: {
    confirmed: "Confirmed",
    draft: "Draft",
    estimated: "Estimated",
    awaitingReview: "Awaiting review",
    filed: "Filed",
    actionNeeded: "Action needed",
    confirmedHelp: "Verified value, backed by a document.",
    draftHelp: "Being entered, not yet reviewed.",
    estimatedHelp: "Indicative estimate, not binding.",
    awaitingReviewHelp: "Prepared, waiting on a qualified reviewer.",
    filedHelp: "Filed, with proof of filing on record.",
    actionNeededHelp: "Something is expected from you.",
    awaitingEvidence: "Filing unconfirmed",
    awaitingEvidenceHelp: "Submitted, but no acknowledgment on record.",
  },
  footer: {
    disclaimer:
      "Interface prototype — no DGI authorization, partnership or e-filing integration is established or claimed.",
  },
  work: {
    myDay: "To do",
    overdue: "Overdue",
    today: "Due today",
    soon: "Due in 7 days",
    later: "Later",
    nothingDue: "Nothing is waiting on you right now.",
    openRequests: "Open requests",
    request: {
      requested: "Requested",
      in_progress: "In progress",
      in_client_review: "In client review",
      returned: "Returned",
      submitted: "Submitted",
      accepted: "Accepted",
    },
    metrics: {
      atRisk: "Deadlines at risk",
      avgOverdue: "Average days overdue",
      onTime: "Filed on time",
      returnedTwice: "Returned more than once",
      clients: "Clients",
      days: "d",
      returnedHint: "Measures our clarity, not the client's diligence.",
    },
    mine: "Mine",
    firm: "Whole firm",
    evidence: "Evidence",
    demoDates: "Demonstration dates, unverified",
    boundTo: "Bound",
    unbound: "To bind",
    unknownClient: "Unknown client",
    viaLink: "link",
    viaEmail: "email",
  },
  design: {
    title: "Design system",
    intro:
      "Tokens, type and components derived from blueprint section 9. Each brand colour is separate from its text colour so the 4.5:1 contrast rule holds.",
    colours: "Colours",
    typography: "Typography",
    statusHonesty: "Status honesty",
    statusHonestyBody:
      "The interface must visibly distinguish confirmed information, a draft calculation, an estimated risk and work awaiting review. Colour alone is never enough: each state also carries a shape and a label.",
    components: "Components",
    money: "Money",
    moneyBody:
      "The CFA franc has no centimes. Amounts are stored as whole francs and aligned with tabular figures.",
    density: "Density",
    densityBody:
      "Two densities, one token set: the client portal breathes and reads on a phone, the firm workspace shows the most useful information per screen.",
    textColour: "Text",
    fillColour: "Fill",
  },
  common: {
    viewAll: "View all",
    demoData: "Demonstration data",
    xaf: "FCFA",
    prototype: "Prototype",
  },
};

const dictionaries: Record<Locale, Dictionary> = { fr, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** XAF is a zero-decimal currency: whole francs, grouped, never cents. */
export function formatXaf(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}
