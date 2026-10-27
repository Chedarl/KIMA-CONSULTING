# Acceptance tests — incident recovery (Agent B)

Every test is pass/fail. "Auto" = in `npm run test:journey` today. "Browser" = checked
by hand on the prototype route, then on the integrated screen. "SQL" = Agent A's, after
the schema lands. IDs `A-*` are from `../test-protocol.md` §2.

## Engine (automated, `scripts/journey-check.mjs`)

| ID | Criterion | Measure | Status |
|---|---|---|---|
| A-2a | `recordPayment(→verified)` with no cited evidence is refused | every one of 7 states × 3 actors × {undefined, []} refused | **Auto, passing** |
| A-2b | Debit evidence never verifies | SMS, statement, wallet / portal screenshot → `official_evidence_required` from `reference_recorded` and `disputed` | **Auto, passing** |
| A-2c | A debit alone never reaches verified | no `debit_observed → verified` edge; refused even with receipt + credentialed reviewer | **Auto, passing** |
| A-2d | No sequence of taxpayer acts reaches `verified` | breadth-first search from `unknown` over all taxpayer moves | **Auto, passing** |
| A-2e | The only verification that succeeds: credentialed reviewer + official evidence; event basis `verified`, reviewer named | 2 states; uncredentialed reviewer refused | **Auto, passing** |
| T-V | A taxpayer can never set payment `verified` | 7 payment × 5 incident states × 5 evidence sets × 4 citation sets = 700 attempts, 0 accepted | **Auto, passing** |
| T-R | A taxpayer can never set incident `resolved` or `closed_unresolved` | 1,400 attempts, 0 accepted | **Auto, passing** |
| T-S | The taxpayer view is never offered a verify / dispute / resolve control | `offeredPaymentTargets` / `offeredIncidentTargets` over all 35 state pairs | **Auto, passing** |
| T-D | Every taxpayer act is recorded `declared`; the full reference is never kept | debit → reference → evidence → contact chain; serialised incident contains no full reference | **Auto, passing** |
| T-X | Resolving a debit incident needs verified payment, official evidence and a reason; a resolved incident refuses further acts | 4 refusal reasons then 1 success | **Auto, passing** |
| A-7 | `nextBestAction()` returns exactly one action; each has a `verified` (kima_policy, with ref and label) source or the exact bilingual fallback | every combination (> 1,000 inputs) plus F-1…F-4, both views | **Auto, passing** |
| A-7b | Administration-dependent actions always use the fallback; guidance text contains no number of 3+ digits | same enumeration | **Auto, passing** |
| A-8 | Never suggests paying again while payment is `debit_observed`, `reference_recorded`, `disputed`; the taxpayer sees the do-not-pay-again warning in those states | `suggestsPayment === false`; no pay-phrase in FR or EN; warning flag on > 100 held-debit inputs | **Auto, passing** |
| D4-a | A `payment_step_error` incident becomes `debit_not_recognised` when its payment first shows a debit (owner decision D4) | `unknown`/`attempted` → `debit_observed`, `attempted` → `reference_recorded`, and `recordReference`, by taxpayer and reviewer; no switch on `attempted` or `not_applicable`, on a refused act, or for the other two types; F-2 switches | **Auto, passing** |
| D4-b | The switch is recorded as exactly one `incident_type_changed` event, `declared` when the taxpayer caused it, `recorded` when a reviewer did | one event after debit → reference → dispute → verify → resolve | **Auto, passing** |
| D4-c | A switched incident cannot be resolved until a credentialed reviewer verifies the payment | `payment_not_verified` at `debit_observed`, `reference_recorded`, `disputed`; taxpayer and uncredentialed reviewer cannot verify; resolves once verified; an unswitched row with a debit is gated too | **Auto, passing** |
| D5-a | The day-count detector catches "30 jours", "10 working days", "huit jours", "two weeks", "15 j", "45-day", and passes "4 derniers caractères", "seconde fois", "journal" | 14 samples | **Auto, passing** |
| D5-b | No next-action text, source line, warning or prototype string shows a number of days (owner decision D5) | every `nextBestAction()` input, both views, plus every FR and EN string in `lib/i18n-incident.ts` | **Auto, passing** |
| D5-c | A reviewer may move a debit to `disputed` at once; there is no waiting period and no date input | `debit_observed`, `reference_recorded` → `disputed` at the debit's own time; taxpayer refused | **Auto, passing** |
| F | Fixtures are synthetic and consistent | ids F-1…F-4; no NIU-shaped string; verified payment in F-4 backed by a reviewer event citing an official receipt; references masked | **Auto, passing** |
| A-11 | Every new string exists in FR and EN | `en: typeof fr` in `lib/i18n-incident.ts`; `npm run typecheck` | **Auto (typecheck), passing** |

## Screen (browser)

| ID | Criterion | Measure | Status |
|---|---|---|---|
| S-1 | Route returns 200 in both locales and shows the synthetic-data label | `curl` `/fr/prototype/incident`, `/en/prototype/incident`: HTTP 200, label present | **Checked 27 Oct (dev server)** |
| S-2 | Page is not indexed and not linked | `<meta name="robots" content="noindex, nofollow, nocache">`; no reference to the route outside its own files | **Checked 27 Oct** |
| S-3 | Five dimensions shown separately, each with a basis word | 5 cells, 5 chips, F-1…F-4 | Browser — to do |
| S-4 | At 375 × 667, the next action is fully visible without scrolling, FR and EN | screenshot | Browser — to do |
| S-5 | The taxpayer view has no verify / resolve control in any fixture | inspect F-1…F-4 | Browser — to do (engine-guaranteed by T-S) |
| S-6 | Recording a reference shows only `•••• xxxx`; the field is empty after save | type `SYNTH-REF-1234` | Browser — to do |
| S-7 | Reviewer refusal is visible and specific | F-3, cite the SMS, "Verify" → "Refused: an official document is required…" | Browser — to do |
| S-8 | No "Payé / Paid / Conforme / Complete" before a reviewer act | text search on each fixture state | Browser — to do |
| S-9 | Nothing styled like an ACF; the "not an ACF" line is present in both locales | inspection; `curl` grep | Line **checked 27 Oct**; inspection to do |
| S-10 | Touch targets ≥ 44 px; focus visible; contrast ≥ 4.5:1 | DevTools at 375 / 768 / 1024 / 1440 | Browser — to do |
| S-11 | First meaningful render on Slow 3G under 5 s at 375 | DevTools throttling | Browser — to do (page JS 10.1 kB, first load 110 kB) |

## After integration (Agent A, SQL)

A-3, A-4 (client cannot insert firm event kinds or PATCH payment to `verified`), plus:
a client cannot insert an `incident_contacts` row for another taxpayer; `incident_contacts`
rejects UPDATE and DELETE; `payment_state = 'verified'` CHECK requires reviewer, time and
an official `incident_evidence` row.

## Comprehension (people — protocol §4)

Unchanged from `../test-protocol.md` §4. **No claim that KIMA helps** until it runs.
