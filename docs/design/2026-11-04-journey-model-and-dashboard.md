# KIMA OS — the journey model, and the dashboard rebuild

Owner brief, 4 November, with nine screen specs, a rendered dashboard mockup and
three UI prototypes. This is the design that follows. It supersedes parts of
`2026-11-04-ui-direction.md` (#380), which was written from generic references
before these specs existed; where the two disagree, this wins.

## 1. The vocabulary, decided

The owner's naming, replacing the reference products' words:

| Reference word | KIMA word | What it is |
|---|---|---|
| Pipeline | **Parcours / Journey** | the named sequence of stages work moves through |
| Deal / Job | **Dossier / Job** | one obligation × period travelling a journey |
| Task | **Tâche / Task** | a step inside a job, with an owner |

**This needs no migration.** A journey is the stage template; a job is a
`compliance_cases` row; a task is a `case_tasks` row. The nouns change, the
schema does not.

The journey, from spec 03:

```
Documents → Préparation → Revue interne → Accord client → Dépôt tenté
         → Dépôt vérifié → Terminé
         branches: Bloqué · Renvoyé · Annulé
```

Seven stages and three branches. The prototype draws it as a stepper with a
state chip under each node, on the job header.

## 2. What the specs settle that I had guessed at

- **Colour.** Navy `#18243B` for text and nav; **gold `#C9A227` for shapes and
  rules on white only, gold *text* is `#8A6D12`**; indigo `#455DA8` for links;
  success `#15803D`. **No teal.** Gold is used in exactly two places: the logo
  node, and the 2px rule under a section title.
- **Status is word + icon, never colour alone**: ✓ Accepté · ↩ Renvoyé (+ reason)
  · ✕ Rejeté · ⏳ En attente · ⚠ À vérifier.
- **Returned is not rejected.** ↩ Renvoyé is indigo and carries a motif; ✕ Rejeté
  is a navy outline. They are different outcomes and must not share a tone.
- **No invented dates.** 1 of 14 obligations is verified. An unverified rule
  renders as "⚠ À vérifier (source de la règle requise)" and never as a deadline.
  `due_needs_confirmation` defaults to true.
- **Firm desktop-first, client mobile-first.**

## 3. Conflicts with what is already on main

Stated plainly, because each is a decision to take rather than a bug:

1. **Gold does not exist in the codebase.** `grep` for `C9A227` / `8A6D12`
   across `globals.css` and `tailwind.config.ts` returns nothing. The brand's
   second colour has never been implemented. → add the tokens, use them for the
   logo node and section rules only.
2. **The rail.** Shipped: nine entries. The mockup: seven — Accueil · Tâches ·
   Coffre · Messages · Clients · Calendrier · Réglages. The prototypes show two
   further variants. → adopt the mockup's seven; the folded screens stay
   reachable as tabs, as they already are.
3. **`StatusPill` tones.** Mine are confirmed/awaiting/attention/estimated/
   neutral/refused. The spec's vocabulary is Accepté/Renvoyé/Rejeté/En attente/
   À vérifier, and **Renvoyé has no tone of mine** — it is indigo with a reason.
   → add a `returned` tone and an icon to every pill, since word + icon is the
   rule and my pills carry a dot, not an icon.
4. **The accounts table I built** uses NIU · Dossier · Étiquettes · Segments ·
   Type. Spec 05 asks for Raison sociale · NIU · Centre · Régime · Engagement ·
   Prochaine. → rebuild to the spec; keep Type, because it is the axis that
   decides which portal the client sees.

## 4. The dashboard, as specified

Three sections, each under a gold 2px rule, counts linking to filtered lists:

- **PROCHAINES ACTIONS** — at most five, ranked by `lib/next-best-action.ts`,
  each row one sentence and one verb: *↩ Renvoyé · SARL Bois Sanaga — relevé
  bancaire* `[Ouvrir]` · *⏳ En attente · ETS Mbarga — 3 pièces* `[Relancer]` ·
  *✓ Prêt · GIE Kribi — revue en 3 points terminée* `[Rendre le verdict]`.
- **CE MOIS-CI** — deadlines with a verification chip, and the standing line
  *"Date indicative : source de la règle requise. KIMA n'est pas relié à la DGI."*
- **ÉTAT DES DOSSIERS** — the journey's stages as counts: Documents · Préparation
  · Revue interne · Accord client · Bloqué.

Footer: pending invitations with their expiry, and the data-freshness line.

## 5. The two new surfaces

- **Propositions / Proposals** — the lettre de mission and quotes, with their
  own small journey (brouillon → envoyée → acceptée → refusée → expirée). A
  proposal accepted is what *creates* the engagement, which is the honest link
  between winning work and being authorised to do it.
- **Workflows** — the journey templates themselves: which stages, which tasks
  per obligation code, who owns each. Today the DGI-step checklist is seeded in
  code; this is where a firm edits it.

Both are **[PROPOSED]** — new schema, and neither should be built before the
dashboard and the journey rename land.

## 6. Build order

1. Gold tokens + the section rule.
2. `StatusPill` gains the spec's vocabulary: a `returned` tone, and an icon per
   tone.
3. Dashboard: the three sections above, over existing data.
4. Rail to seven.
5. Accounts table rebuilt to spec 05.
6. Journey stepper on the job header.
7. Proposals, then Workflows.

Each its own PR under the 300-line gate.
