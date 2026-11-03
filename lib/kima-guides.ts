export type GuideLocale = "fr" | "en";

export type KimaGuide = {
  id: string;
  match: RegExp;
  title: Record<GuideLocale, string>;
  purpose: Record<GuideLocale, string>;
  firstAction: Record<GuideLocale, string>;
  steps: Record<GuideLocale, string[]>;
  caution?: Record<GuideLocale, string>;
};

export const kimaGuides: KimaGuide[] = [
  {
    id: "tasks",
    match: /\/workspace\/tasks/,
    title: { fr: "Le tableau des tâches", en: "The task board" },
    purpose: {
      fr: "Chaque tâche est rattachée à un dossier et à une échéance. La colonne indique l'état : à faire, en cours, terminé.",
      en: "Every task is attached to a case and a due date. The column shows the state: to do, in progress, done.",
    },
    firstAction: { fr: "Créer votre première tâche : choisissez le dossier, écrivez l'intitulé, validez.", en: "Create your first task: pick the case, write the title, confirm." },
    steps: {
      fr: ["Choisissez un dossier dans la liste déroulante.", "Saisissez l'intitulé de la tâche.", "Validez : la tâche apparaît dans la colonne « à faire »."],
      en: ["Pick a case from the dropdown.", "Type the task title.", "Confirm: the task appears in the to-do column."],
    },
  },
  {
    id: "incidents",
    match: /\/workspace\/incidents/,
    title: { fr: "Le registre des incidents de paiement", en: "The payment incident register" },
    purpose: {
      fr: "Un incident naît d'une alerte bancaire : un débit que le client ne reconnaît pas. Il se documente, s'escalade, puis se vérifie.",
      en: "An incident starts from a bank alert: a debit the client does not recognise. It gets documented, escalated, then verified.",
    },
    firstAction: { fr: "Enregistrer un incident : choisissez le contribuable, le montant et décrivez l'erreur constatée.", en: "Record an incident: pick the taxpayer, the amount and describe the error." },
    steps: {
      fr: ["Sélectionnez le contribuable concerné.", "Indiquez le montant et la nature de l'erreur.", "Enregistrez : le journal de bord du dossier s'ouvre avec l'événement."],
      en: ["Select the taxpayer concerned.", "Enter the amount and the nature of the error.", "Save: the case timeline opens with the event."],
    },
    caution: { fr: "Un incident ne se clôt qu'après vérification par un réviseur.", en: "An incident closes only after reviewer verification." },
  },
  {
    id: "dsf",
    match: /\/workspace\/dsf/,
    title: { fr: "La passerelle DSF", en: "The DSF bridge" },
    purpose: {
      fr: "Vous importez un grand livre exporté du logiciel comptable : KIMA lit les écritures, rapproche les comptes du plan OHADA et signale les anomalies.",
      en: "You import a ledger exported from the accounting software: KIMA reads the entries, maps accounts to the OHADA chart and flags defects.",
    },
    firstAction: { fr: "Faire un essai à blanc : chargez un petit fichier CSV et analysez-le.", en: "Run a dry run: load a small CSV file and analyse it." },
    steps: {
      fr: ["Téléchargez le CSV du grand livre.", "Cliquez sur Analyser : l'essai à blanc n'écrit rien.", "Consultez les totaux, les comptes non rapprochés et téléchargez le résumé."],
      en: ["Upload the ledger CSV.", "Click Analyse: the dry run writes nothing.", "Review the totals, the unmapped accounts and download the summary."],
    },
    caution: { fr: "Montants en XAF entiers uniquement. Le classeur officiel DGI reste à homologuer.", en: "Whole XAF amounts only. The official DGI workbook is not yet approved." },
  },
  {
    id: "settings",
    match: /\/workspace\/settings/,
    title: { fr: "Le profil du cabinet", en: "The firm profile" },
    purpose: {
      fr: "Nom, ville, langue de travail : ces champs décrivent le cabinet et n'apparaissent que dans son espace.",
      en: "Name, city, working language: these fields describe the firm and appear only inside its workspace.",
    },
    firstAction: { fr: "Relire les champs du profil et enregistrer une correction.", en: "Review the profile fields and save a correction." },
    steps: {
      fr: ["Modifiez un champ (nom, ville, langue).", "Cliquez sur Enregistrer.", "La confirmation s'affiche ; le changement est immédiat."],
      en: ["Edit a field (name, city, language).", "Click Save.", "The confirmation appears; the change is immediate."],
    },
  },
  {
    id: "kyc",
    match: /\/workspace\/kyc/,
    title: { fr: "Le portail KYC", en: "The KYC portal" },
    purpose: {
      fr: "Réservé aux administrateurs KIMA : demandes non attribuées, demandes générales et vérification des cabinets.",
      en: "KIMA administrators only: unassigned applications, general inquiries and firm verification.",
    },
    firstAction: { fr: "Vérifier un cabinet en attente : un numéro d'immatriculation doit exister.", en: "Verify a waiting firm: a registration number must exist." },
    steps: {
      fr: ["Ouvrez la section Cabinets.", "Cliquez sur Vérifier pour un cabinet non vérifié.", "La décision est enregistrée avec son motif."],
      en: ["Open the Firms section.", "Click Verify on an unverified firm.", "The decision is recorded with its reason."],
    },
    caution: { fr: "Un cabinet sans numéro ne peut pas être vérifié.", en: "A firm without a number cannot be verified." },
  },
  {
    id: "clients",
    match: /\/workspace\/clients/,
    title: { fr: "Les clients", en: "Clients" },
    purpose: {
      fr: "Chaque contribuable lié au cabinet par un engagement apparaît ici, avec ses dossiers.",
      en: "Every taxpayer linked to the firm through an engagement appears here, with their cases.",
    },
    firstAction: { fr: "Ouvrir une fiche client pour voir ses dossiers et échéances.", en: "Open a client record to see their cases and deadlines." },
    steps: { fr: ["Parcourez la liste.", "Ouvrez une fiche.", "Consultez les dossiers rattachés."], en: ["Browse the list.", "Open a record.", "Review the attached cases."] },
  },
  {
    id: "calendar",
    match: /\/workspace\/calendar/,
    title: { fr: "Le calendrier des échéances", en: "The deadline calendar" },
    purpose: {
      fr: "Les échéances légales des contribuables, calculées par le moteur de règles.",
      en: "The taxpayers' legal deadlines, computed by the rules engine.",
    },
    firstAction: { fr: "Repérer la prochaine échéance et ouvrir son dossier.", en: "Spot the next deadline and open its case." },
    steps: { fr: ["Choisissez la période.", "Consultez les échéances par contribuable."], en: ["Pick the period.", "Review deadlines per taxpayer."] },
  },
  {
    id: "inbox",
    match: /\/workspace\/inbox/,
    title: { fr: "La corbeille des documents", en: "The document inbox" },
    purpose: {
      fr: "Les documents envoyés par les clients arrivent ici pour examen : accepter, refuser, renvoyer.",
      en: "Documents sent by clients land here for review: accept, refuse, return.",
    },
    firstAction: { fr: "Examiner le premier document en attente de décision.", en: "Review the first document waiting for a verdict." },
    steps: { fr: ["Ouvrez un document.", "Rendez une décision motivée.", "Le client voit la décision dans son portail."], en: ["Open a document.", "Record a reasoned verdict.", "The client sees the verdict in their portal."] },
  },
  {
    id: "billing",
    match: /\/workspace\/billing/,
    title: { fr: "La facturation", en: "Billing" },
    purpose: {
      fr: "Honoraires, paiements de service et échéances de recouvrement par client.",
      en: "Fees, service payments and collection deadlines per client.",
    },
    firstAction: { fr: "Ouvrir un dossier et consulter ses honoraires enregistrés.", en: "Open a case and review its recorded fees." },
    steps: { fr: ["Choisissez un dossier.", "Consultez factures et paiements."], en: ["Pick a case.", "Review invoices and payments."] },
  },
  {
    id: "staff",
    match: /\/workspace\/staff/,
    title: { fr: "L'équipe", en: "Staff" },
    purpose: {
      fr: "Les membres du cabinet et leurs rôles ; les invitations arrivent ici.",
      en: "The firm's members and their roles; invitations land here.",
    },
    firstAction: { fr: "Vérifier les rôles des membres existants.", en: "Check the existing members' roles." },
    steps: { fr: ["Consultez la liste.", "Invitez un membre si votre rôle le permet."], en: ["Review the list.", "Invite a member if your role allows it."] },
  },
  {
    id: "vault",
    match: /\/workspace\/vault/,
    title: { fr: "Le coffre des documents", en: "The document vault" },
    purpose: {
      fr: "Versions horodatées des documents, avec téléchargement par lien signé à durée limitée.",
      en: "Timestamped document versions, with downloads through expiring signed links.",
    },
    firstAction: { fr: "Ouvrir un document et consulter ses versions.", en: "Open a document and review its versions." },
    steps: { fr: ["Choisissez un document.", "Consultez les versions.", "Générez un lien de téléchargement si nécessaire."], en: ["Pick a document.", "Review the versions.", "Generate a download link if needed."] },
    caution: { fr: "Les liens signés expirent ; partagez-les rapidement.", en: "Signed links expire; share them promptly." },
  },
  {
    id: "messages",
    match: /\/workspace\/messages/,
    title: { fr: "La messagerie", en: "Messaging" },
    purpose: {
      fr: "Les fils de discussion entre le cabinet et chaque client.",
      en: "The threads between the firm and each client.",
    },
    firstAction: { fr: "Ouvrir un fil existant ou en démarrer un.", en: "Open an existing thread or start one." },
    steps: { fr: ["Choisissez un fil.", "Répondez dans le fil."], en: ["Pick a thread.", "Reply inside the thread."] },
  },
];

export const kimaChecklist: Record<GuideLocale, { id: string; label: string; guideId: string }[]> = {
  fr: [
    { id: "first-task", label: "Créer une première tâche", guideId: "tasks" },
    { id: "first-incident", label: "Enregistrer un incident", guideId: "incidents" },
    { id: "first-dsf", label: "Essayer la passerelle DSF à blanc", guideId: "dsf" },
    { id: "first-settings", label: "Vérifier le profil du cabinet", guideId: "settings" },
    { id: "first-client", label: "Ouvrir une fiche client", guideId: "clients" },
    { id: "first-inbox", label: "Examiner un document en attente", guideId: "inbox" },
  ],
  en: [
    { id: "first-task", label: "Create a first task", guideId: "tasks" },
    { id: "first-incident", label: "Record an incident", guideId: "incidents" },
    { id: "first-dsf", label: "Try the DSF bridge dry run", guideId: "dsf" },
    { id: "first-settings", label: "Review the firm profile", guideId: "settings" },
    { id: "first-client", label: "Open a client record", guideId: "clients" },
    { id: "first-inbox", label: "Review a waiting document", guideId: "inbox" },
  ],
};
