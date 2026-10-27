# Wireframes — incident recovery (Agent B)

ASCII, two widths, two views. The built prototype (`/fr/prototype/incident`) follows
these; where it differs, the prototype is the reference and this page should be updated.
Scenario shown: **F-3** (debited, reference recorded, two contacts, waiting).

Legend: `[ ]` button, `( )` radio, `▾` select, `~~~` dashed border (declared / uncertain),
`!` amber warning. No seal, stamp, QR code or "conforme" anywhere.

## 1. Taxpayer — 375 px

Order is chosen so the next action is visible without scrolling at 375 × 667.

```
┌─────────────────────────────────────┐
│~! Prototype — données fictives /   ~│  compact banner (body text moves
│~  synthetic data                   ~│  to the footer on mobile)
├─────────────────────────────────────┤
│ PROTOTYPE · AGENT B                 │
│ Prélèvement effectué, paiement      │  h1
│ non reconnu                         │
├─────────────────────────────────────┤
│ Scénario  [F-3 · Débité, non rec. ▾]│
│ Vue  [ Contribuable | Réviseur ]    │  segmented, 44 px
│ [ Réinitialiser le scénario ]       │
├═════════════════════════════════════┤
│ VOTRE PROCHAINE ACTION              │  navy-soft card
│ Attendez la réponse et notez-la     │
│ ici dès qu'elle arrive              │
│ Votre dernier contact est           │
│ enregistré. Le délai…n'est pas connu│
│ ┌─────────────────────────────────┐ │
│ │! Ne payez pas une seconde fois… │ │  amber
│ └─────────────────────────────────┘ │
│ Source : Pas encore confirmé —      │  amber text when fallback
│ renseignez-vous auprès de votre CDI │
├═════════════════════════════════════┤  ← fold at ~667 px
│ Cinq statuts, jamais fusionnés      │
│ ┌ Travail KIMA ─────────────────┐   │  one cell per dimension,
│ │ Preuve du dépôt  (Étape)      │   │  stacked at 375
│ ├ Dépôt ────────────────────────┤   │
│ │ Dépôt vérifié  ✓Vérifié       │   │
│ ├ Paiement de l'impôt ──────────┤   │
│ │ !Référence notée — non vérifié│   │
│ │ ~✎ Vous avez déclaré~         │   │
│ ├ Honoraires KIMA ──────────────┤   │
│ ├ Attestation (ACF) ────────────┤   │
│ └ Non demandée  ○ Enregistré ───┘   │
├─────────────────────────────────────┤
│ Incident · Débité, non reconnu      │
│ Statut  En attente de l'admin.      │
│ Constaté le 2026-07-16 09:10 (Doua.)│
│ Référence  [•••• 0000]  4 derniers  │
│ Preuves                             │
│  SMS de débit  sms-…-fictif.png ~✎~ │
│  Capture du portail …          ~✎~  │
├─────────────────────────────────────┤
│ Journal des contacts                │
│  Au guichet          2026-07-17 10:30│
│  Avec : Guichet du centre (fictif)  │
│  Réponse : …   !Reste ouvert : …    │
│  Téléphone           2026-07-24 11:15│
│  N° de dossier : •••• 0001          │
├─────────────────────────────────────┤
│ Noter ce qui s'est passé            │
│ ( ) J'ai été débité                 │
│ ( ) J'ai la référence…              │
│ ( ) J'ajoute une preuve             │
│ ( ) J'ai contacté l'administration  │
│ ( ) Je n'ai pas de réponse : relancer│
│ [fields for the chosen option]      │
│ ! N'écrivez jamais de mot de passe… │
│ [        Enregistrer         ]      │
├─────────────────────────────────────┤
│ Ce qui reste ouvert                 │
│ • Le paiement n'est pas vérifié.    │
│ • L'incident n'est pas clos.        │
├─────────────────────────────────────┤
│ Historique (newest first, basis chip│
│ on every row)                       │
├─────────────────────────────────────┤
│ Démonstration sur des données…      │
│ Ceci n'est pas une Attestation de   │
│ Conformité Fiscale…                 │
└─────────────────────────────────────┘
```

## 2. Taxpayer — 1440 px

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│~! Prototype — données fictives / synthetic data — Démonstration sur des données inventées… ~│
│ PROTOTYPE · AGENT B                                                                        │
│ Prélèvement effectué, paiement non reconnu                                                 │
│ Boutique Ndolo (fictif) a été débitée pour son IGS, mais le paiement n'apparaît pas…       │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ Scénario [F-3 · Débité, non reconnu ▾]        Vue [Contribuable|Réviseur]  [Réinitialiser] │
├════════════════════════════════════════════════════════════════════════════════════════════┤
│ VOTRE PROCHAINE ACTION                                                                     │
│ Attendez la réponse et notez-la ici dès qu'elle arrive                                     │
│ [! Ne payez pas une seconde fois tant que ce prélèvement n'est pas éclairci…]              │
│ Source : Pas encore confirmé — renseignez-vous auprès de votre centre des impôts           │
├════════════════════════════════════════════════════════════════════════════════════════════┤
│ Cinq statuts, jamais fusionnés                                                             │
│ ┌ Travail KIMA ─┬ Dépôt ─────────┬ Paiement de l'impôt ─────┬ Honoraires ─┬ Attestation ─┐ │
│ │ Preuve dépôt  │ Dépôt vérifié  │ !Référence notée — non   │ Facturé     │ Non demandée │ │
│ │ ○ Étape       │ ✓ Vérifié      │ ~✎ Vous avez déclaré~    │ ○ Enregistré│ ○ Enregistré │ │
│ └───────────────┴────────────────┴──────────────────────────┴─────────────┴──────────────┘ │
├──────────────────────────────────────────────────────┬─────────────────────────────────────┤
│ Incident · Débité, non reconnu        (3 fr)         │ Noter ce qui s'est passé    (2 fr)  │
│ Statut | Constaté le | Étape | Message               │ ( ) options … [Enregistrer]         │
│ Référence •••• 0000                                  ├─────────────────────────────────────┤
│ Preuves: list with basis chips                       │ Ce qui reste ouvert                 │
├──────────────────────────────────────────────────────┤ • paiement • incident               │
│ Journal des contacts: one card per contact           ├─────────────────────────────────────┤
│                                                      │ Historique                          │
└──────────────────────────────────────────────────────┴─────────────────────────────────────┘
│ Ceci n'est pas une Attestation de Conformité Fiscale…                                      │
```

## 3. Reviewer — 375 px

Same header, next-action card titled **ACTION DU RÉVISEUR**; the "record" form is
replaced by the reviewer panel. The taxpayer never sees this panel in the product.

```
├═════════════════════════════════════┤
│ ACTION DU RÉVISEUR                  │
│ Rien à vérifier : aucune pièce      │  F-3: no official document yet
│ officielle                          │
│ Source : Règle KIMA sur la tenue…   │
├─────────────────────────────────────┤
│ (five statuses, basis reads         │
│  "Déclaré par le contribuable")     │
├─────────────────────────────────────┤
│ Contrôle du réviseur                │
│ Réviseur fictif, inscription enreg. │
│ ! Aucune pièce officielle jointe :  │
│   rien ne peut être vérifié.        │
│ Pièce citée [ — ▾ ]                 │
│ Motif       [            ]          │
│ [ Vérifier le paiement ]            │  refusal shown inline if gate fails
│ [ Marquer contesté ]                │
│ [ Clore l'incident (résolu) ]       │
│ [ Clore sans solution ]             │
├─────────────────────────────────────┤
│ Refusé : Une pièce officielle est   │  role=status, aria-live
│ exigée ; un SMS ou un relevé ne…    │
```

## 4. Reviewer — 1440 px

As §2, with the right column's top panel replaced by "Contrôle du réviseur" (§3), and
the next-action card reading the reviewer action. Evidence rows carry
"Pièce officielle" vs "Votre propre relevé" so the reviewer sees at a glance what can
support a verification.

## 5. What these wireframes deliberately leave out

Amounts and due dates (no verified IGS rule), any phone number or URL for support
(S-5 not verified), any "Payé" / "Paid" wording before a reviewer act, any badge that
could be mistaken for an official certificate.
