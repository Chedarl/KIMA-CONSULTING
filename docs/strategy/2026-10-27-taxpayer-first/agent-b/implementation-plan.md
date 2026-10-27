# Implementation plan — incident recovery (Agent B)

Gate status (`AGENTS.md`): the owner's 27 Oct instruction authorises this branch as a
**draft PR** with the plan and an **isolated mock-data prototype**. It does not authorise
merging, deploying, SQL, or connecting to the backend.

## Done in this PR (`agent-b/incident-prototype`)

| Item | Files | Backlog |
|---|---|---|
| Incident + payment state machine, pure | `lib/incidents.ts` | P1-1 (engine half), P1-2 (engine half) |
| One next best action, pure, sourced or fallback | `lib/next-best-action.ts` | P1-3 |
| Fixtures F-1…F-4, synthetic | `lib/mocks/incidents.ts` | test protocol §1 |
| Prototype screen, taxpayer and reviewer views | `app/[locale]/prototype/incident/page.tsx`, `components/prototype/*` | P1-4, P1-6 (UI shape only) |
| FR/EN copy, `en: typeof fr` | `lib/i18n-incident.ts` | A-11 |
| Journey checks A-2, A-7, A-8, taxpayer-cannot-verify | `scripts/journey-check.mjs`, `npm run test:journey` | test protocol §2 |
| Schema request to Agent A | `docs/agents/handoffs/2026-10-27-b-to-a-incident-schema.md` | P1-1, P1-2 |

## Next steps, in order (each its own PR; none started)

| # | Step | Owner | Depends on | Effort |
|---|---|---|---|---|
| 1 | Owner reviews the prototype on a preview; comprehension dry-run with role-play (not evidence) | Owner, B | this PR | S |
| 2 | Agent A answers the handoff; contract fixed in one file | A | — | S |
| 3 | `test:journey` added to CI | A (`.github/workflows/` is A's) | step 2 | S |
| 4 | Migration: payment-state enum, `incidents`, `incident_evidence`, `incident_contacts`, RLS, event kinds, CHECKs | A | P0-1, P0-2 merged | L |
| 5 | Reviewer credential (P1-8) in schema and `canApproveReview()` | A | — | S |
| 6 | Align `lib/incidents.ts` names to the merged schema; A adds its SQL negative tests (A-3, A-4) | B, A | step 4 | S |
| 7 | Move the screen to `/app/declarations/[caseId]` (client) and `case-detail.tsx` (firm); delete the prototype route | B | steps 4–6, gate 5 | M |
| 8 | Evidence upload through P0-1 storage, sha256 on upload (P2-3) | B, A | P0-1 | M |
| 9 | Case-file export with "not an ACF" line (P1-5, A-9) | B | step 7 | M |
| 10 | Browser verification FR/EN at 375 / 768 / 1024 / 1440, Slow 3G (protocol §3) | B | step 7 | S |
| 11 | Comprehension test with 5–10 IGS taxpayers on F-2/F-3/F-4 (protocol §4) | Owner, B | step 10 | — |

## Risks

| Risk | Mitigation |
|---|---|
| Schema drifts from the prototype | One handoff, one contract file; step 6 is a rename, not a redesign |
| Guidance text is mistaken for an official procedure | Every administration-dependent action uses the fallback; A-7b forbids numbers in guidance |
| The prototype route is found and taken as real | Banner, `noindex`, no nav link, synthetic labels on every name and file; route deleted in step 7 |
| "Verified" from a KIMA policy source is read as a verified tax rule | The source label says "KIMA rule … (not a tax rule)"; the kind is `kima_policy` |
| Low-RAM build machine | Page JS is 10.1 kB; no new dependency |

## What an independent reviewer should check

1. `lib/incidents.ts`: no edge `debit_observed → verified`; every path to `verified` /
   `resolved` passes `reviewerGate` and `officialEvidenceGate`.
2. `lib/next-best-action.ts`: no action text tells the taxpayer to pay; no hotline, URL,
   date, amount or procedure stated as fact.
3. The page at 375 px in both locales: the next action is above the fold; the reviewer
   panel never appears in the taxpayer view.
4. Fixtures: no real NIU, reference or document.
5. Nothing styled like a certificate.
