# KIMA OS — UX/UI redo goal

5 November 2026. Owner instruction: redo the UX and UI for every profile —
individual taxpayer, business taxpayer, and firm workspace — as stated in
`2026-11-04-journey-model-and-dashboard.md` and
`2026-11-04-ux-handover.md`.

This file is the working goal. It is not a new design direction: the design
authority remains the owner palette in
`docs/strategy/2026-10-29-qa-and-adoption/plan.md` §4.5, the journey model, and
the UX handover. This file records what "done" means and the order of work.

## Definition of done, per screen

A screen is done only when all of these are true:

- It reads the product first: the relevant `lib/` model, migrations and screen
  spec, before any reference.
- It uses the shared primitives: `StatusPill`, `SectionHeading`, the portal
  shell, `workspace-nav`, and the existing table and form patterns. No new
  status vocabulary at a call site.
- It uses the owner palette and gold only as a shape or rule on white. Gold
  text is `gold-text` and never on `surface-sunken`.
- It distinguishes confirmed, awaiting, estimated, returned and refused
  states with a word and an icon, never colour alone.
- An unavailable figure is an em dash with an `sr-only` reason, never `0`.
- FR and EN are both complete, including punctuation and the four axes.
- It works at 375, 768, 1024 and 1440 px, with 44 px touch targets and a
  visible focus ring.
- The browser has been opened and the screen looked at, not merely
  typechecked.
- `npm run typecheck`, `npm run lint`, the relevant guards and the Impeccable
  detector are clean.
- The PR is under the 300 changed-line gate and states what could not be
  verified.

## Build order from the update document

- [x] Gold tokens and the 2 px section rule.
- [x] `StatusPill` gains an icon per tone, so word and icon carry the state
  together. The `returned` tone already exists; the dot is not enough.
- [x] Firm dashboard: PROCHAINES ACTIONS, CE MOIS-CI, ÉTAT DES DOSSIERS.
- [x] Firm rail to seven destinations, with folded screens reachable as tabs.
- [x] Accounts table rebuilt to spec 05: Raison sociale, NIU, Centre, Régime,
  Engagement, Prochaine, plus Type.
- [x] Journey stepper on the job header.
- [ ] Proposals (lettre de mission and quotes) with their own journey.
- [ ] Workflows (journey templates).

## Profile coverage

### Individual taxpayer portal

- [ ] Home and action queue.
- [ ] My obligations.
- [ ] Requests and documents.
- [ ] Payments and fees.
- [ ] Engagement letter and acceptance.
- [ ] Profile, contacts and preferences.
- [ ] Account switcher for a person with several tax files.

### Business taxpayer portal

- [ ] Business identity and the four axes.
- [ ] Obligations for the business, with the regime and centre kept separate.
- [ ] Requests, documents and payments.
- [ ] Contacts and account links.
- [ ] Engagement letter and acceptance.
- [ ] Account switcher between individual and business files.

### Firm workspace

- [x] Dashboard with the three specified sections.
- [x] Clients and accounts table to spec 05.
- [ ] Jobs, journey stepper and task lists.
- [ ] Documents, inbox and vault.
- [ ] Calendar, compliance radar and deadlines.
- [ ] Messages, reviews and settings.
- [x] Rail at seven destinations with count badges where a single source
  exists.

## Method for every increment

1. Read the existing product and the matching spec. A missing feature is
   often a defect in something that already exists.
2. Interrogate the reference: take the structure that serves follow-up and
   compliance, reject the rest.
3. Build the smallest honest increment as one coherent change.
4. Verify in a browser at the four widths.
5. Run the ECC reviewers, the UI/UX skill, `ant` guidance and the Impeccable
   detector.
6. Open the PR with evidence and state what could not be verified.

## Merge and production rule

The owner has given a standing instruction on 5 November 2026: merge green,
reviewed pull requests without asking again, and verify that the merged change
is in production and has no issues.

Before a merge: CI and `Verify migrations` must be green for that exact head.
After a merge: the `Supabase migrations` workflow must apply, the Vercel
production deployment must succeed, and the production URL must answer.
A failing check is fixed, not bypassed, except for the up-to-date requirement
when the branch is otherwise green.
