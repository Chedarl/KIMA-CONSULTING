# Screen conformance — spec, design system, backend wiring, and mockup ties

Date: 4 November 2026. 26 pages audited, all passing.

## Method

`scripts/screen-conformance.cjs` signs in as the demo firm (and the demo taxpayer for the
portal), visits each page and asserts:

1. **Spec elements** — the signature strings of that page, now including the mockup's
   KPI labels, tab sets, panel titles and actions.
2. **Design system** — the KIMA theme variable resolves, exactly one main landmark,
   the shared shell and cards render.
3. **Backend wiring** — every table the page must read exists in production.

The audit waits for the first expected string before reading the page, because a
skeleton at read time is not a pass.

## Mockup ties (the five core screens)

| Screen | Mockup elements asserted |
|---|---|
| Firm command center (F02) | Clients actifs · Tâches en cours · Échéances fiscales (15 jours) · Conformité des clients · Tâches du cabinet |
| Client 360 (F04) | Vue d'ensemble · Tâches · Documents · Fiscalité · Comptabilité · Notes & historique · Créer une tâche · Partager au client |
| Workflows (F06) | Kanban · Liste · Calendrier · Modèles · Automatisations · Nouveau workflow · À démarrer · Terminé |
| Documents (F10) | Tous · Demandes · À revoir · Approuvés · Versions · Audit |
| Document review (F11) | verdicts · Métadonnées · Comptable · Déductibilité · TVA |
| Kima AI (F19) | Kima AI · Suggestions · Sources utilisées · Sources vérifiées uniquement |
| Taxpayer home (C02) | Mes demandes · Tâches à traiter · Obligations fiscales · Documents · Envoyer une pièce |

## Full matrix (all passing)

Firm: F02, F03, F04, F05, F06, F08, F10, F11, F12, F13, F14, F15, F17, F18, F19, F20,
A01 — all 200, spec elements present, tables wired.
Portal: C02, C03, C04, C05, C06, C07, C08, plus the declarations and services pages —
all 200.

## Corrections made to the audit itself

- The dashboard read too early (skeleton), fixed by waiting for the first expected string.
- `obligation_rules` does not exist; the compliance surfaces read `compliance_cases`.
- `incidents` is `payment_incidents`; `firms` is `organizations`.
- C07 expects `paiement`, which is the word the page uses.

## Known gaps (next)

- The Documents inbox is a list, not yet the mockup's column table (Nom, Type, Statut,
  Auteur, Période, Actions). The tabs and status chips are in place.
- Pages outside the current set (F07 split from F13, F09 capacity, F16 time, A02 rules,
  P01/P02, C01) still need their own conformance entries.
