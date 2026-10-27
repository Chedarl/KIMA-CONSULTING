# Product parity and user journeys — Agent B's conclusions

*Agent B (Claude Code), 27 Oct 2026. Agent B owns the product-parity and user-journey
conclusions (`AGENTS.md`). This file reviews Agent A's `taxdome-feature-parity.md` and
`user-journey-gaps.md` (PR #11, merged as `4ab8177`, written
at `main` @ `26d1ac7`) against the code at **`main` @ `d6f9cca`** (PR #6 merged after
Agent A's audit). Agent A's files are not edited. Line numbers are at `d6f9cca`; rechecked on `729a7ad` (#11 and #12 are docs and config only).*

*Scope of my checking: the repository code only. I did not query the database, so every
finding Agent A marks "verified live" is reported here as **not independently verified**.
I did not re-read TaxDome's help centre; I accept Agent A's TaxDome column as
documentation, not observed behaviour, exactly as Agent A labels it.*

## 1. Where I agree

| # | Agent A's finding | My evidence |
|---|---|---|
| 1 | No screen creates contacts, links, tags, cases, tasks or portal accounts | A grep for `.insert(` / `.upsert(` after `from("<table>")` in `app/`, `components/`, `lib/` finds **zero** for `contacts`, `contact_account_links`, `tags`, `account_tags`, `compliance_cases`, `case_tasks`, `portal_accounts`, `firm_members`, `invoices` |
| 2 | The work queue shows proposals and writes nothing | `components/live/work-queue.tsx:135` — "these are proposals, and nothing here writes to the database" |
| 3 | A reported (pending) fee payment counts toward "Paid" | Still true after PR #6: `components/live/payments-panel.tsx:288-289` subtracts `b.pending` before `settled`; `:305` shows `copy.paid` when settled |
| 4 | The firm wizard attaches new taxpayers to the oldest organisation and self-authorises the engagement | `components/live/onboarding-wizard.tsx:136` (`limit(1)`), `:167` (`status: "authorized"`, result unchecked) |
| 5 | A client can record nothing about filing or payment | `CLIENT_CAPABILITIES` (`lib/permissions.ts:148-154`) is view, upload, submit, note, download — no declaring capability |
| 6 | Journey D stops at D1: no incident model, table, kind or screen on `main` | No `incident` anywhere in `lib/events.ts` (`EventDimension` at `:55-63`) or `supabase/migrations/` |
| 7 | Tax-payment state has an enum and nothing else | `PaymentEvidenceStatus` (`lib/cases.ts:76-81`); no `recordPayment`; `payment_verified` kind exists but nothing emits it |
| 8 | KIMA's differentiators are hypotheses until the comprehension test runs | Agree without reservation; the prototype here makes none of them a claim |
| 9 | Positioning: lead with verified obligations, evidence-gated status and recovery; build only the practice features the journeys need | Agree. The incident journey needs case creation (A4) and portal-account creation (B2) before it can run for a real user |

## 2. Where I disagree or would correct the record

| # | Agent A says | What the code shows | Consequence |
|---|---|---|---|
| D-1 | "The dashboard's 'next action' is hard-coded demo text (`lib/i18n.ts:91-95`)" (`user-journey-gaps.md` B6; also `gap-matrix.md` #7) | That string is **dead copy**: `t.taxpayer.nextAction` is referenced nowhere in `app/` or `components/` (grep: 0 hits). The live client dashboard derives its action from data — the first open request waiting on the client (`components/live/client-dashboard.tsx:142-145`, `:216`, rendered `:303-330`) | B6 is **partial**, not "stops": there *is* a data-driven next action, but it covers only document requests, carries no source, and says nothing about filing, payment or incidents. The dead strings at `lib/i18n.ts:91-95` / `:318-322` should be deleted (B's path) so nobody wires them back |
| D-2 | `AGENTS.md` and the security review (A1, T-16) refer to `CLIENT_EVENT_KINDS` in `lib/events.ts` | **No such export exists.** The nearest is `clientVisibleKinds()` (`lib/events.ts:804`), which lists kinds a client may **see**, not kinds a client may **write**. Visible ≠ writable: `filing_verified` and `payment_verified` are client-visible and must never be client-writable | T-16 as written ("every kind is client-visible") would pass with the wrong list. The contract needs a separate client-**writable** allow-list. Raised in the handoff |
| D-3 | Billing: "MISSING (issue) / BLOCKED (client report)"; executive summary: "billing (in PR #6, not merged)" | Since `d6f9cca`: `/workspace/billing` exists (`components/live/billing-workspace.tsx`), the firm **confirms or rejects** reported fee payments (`:171-213`), backed by the policy in `supabase/migrations/20261023052633_firm_confirms_service_payments.sql`. **Invoice issuance still does not exist** (that migration says so; no `invoices` insert anywhere) | Row now: confirmation PARTIAL, issuance MISSING. The client-side "Paid" defect (§1 #3) is unchanged |
| D-4 | Proposals / engagement letters: "No proposal document … the firm self-authorises (N-5)" | Since `d6f9cca` there is an engagements screen that inserts engagements (`components/live/engagements-workspace.tsx:303`). The wizard's self-authorisation (`onboarding-wizard.tsx:167`) is still there | Proposal and client acceptance still MISSING; engagement creation is no longer wizard-only |
| D-5 | Incident recovery priority "P2 per brief" | The owner made the payment-discrepancy journey the **first milestone** (`docs/strategy/2026-10-27-taxpayer-first/README.md`, decision 2; Agent A's own roadmap re-sequences it) | The parity row should read P1 / milestone, not P2 |
| D-6 | The tax-payment contract is "in `security-and-integrity-review.md` §3 and the backlog" | §3 lists PRs A0–A4; none defines incident tables or payment states. The concrete shape is in `journeys.md` §4 and `backlog.md` P1-1/P1-2, and the coordinator's interim contract (27 Oct) | Contract should live in one file. Requested in the handoff |
| D-7 | The existing payment enum is implied to be extendable to the new states | It is `not_applicable, unknown, requested, received, verified` (`supabase/migrations/20261022125435_four_status_dimensions.sql:30-36`). `requested` / `received` do not exist in the new union, and Postgres cannot drop enum values | A new type plus a mapping is cleaner than `ALTER TYPE … ADD VALUE`. Agent A's call; raised in the handoff |
| D-8 | Profile "Saved" on refused writes (N-3) | Correct outcome, but the mechanism matters for the fix: `profile-board.tsx:100` does check `error`. An update filtered out by RLS returns **no error and zero rows**, so the check never fires | The fix is the zero-row detection in `lib/db-write.ts` (Agent A's), not an error check in the component |
| D-9 | "Agent B (Cursor)" in both files' headers | `AGENTS.md`: all three agents run in Claude Code | Wording only |

## 3. What the interface suggests that the backend does not support

Agent A's list is right; I add the items I found and the ones this PR introduces.

| Surface | What it suggests | Reality | Source |
|---|---|---|---|
| Client payments "Paid" pill | The fee is settled | Counts unconfirmed money | `payments-panel.tsx:288-305` |
| Client dashboard "Live" | Case history updates in real time | Subscribes to `case_events` (`client-dashboard.tsx:125`); Agent A reports the table is not in the realtime publication (not independently verified) | N-4 |
| Client case page `/app/declarations/[id]` | A declaration page | It renders the *service* view (`ClientService`) with a back link to `/app/services` (`app/[locale]/app/declarations/[caseId]/page.tsx`). Backlog P1-4 puts the incident screen here; the route needs to decide what it is first | — |
| Dead next-action strings | A fixed "next action" | Not rendered (D-1) | `lib/i18n.ts:91-95` |
| **This PR's prototype** — "Enregistrer / Save", "Verify payment", "Resolve" | Something is recorded | **Local state only**; cleared on reload. Labelled on screen ("Saved in this page only") and by the synthetic-data banner | `components/prototype/record-forms.tsx` |
| **This PR's prototype** — reviewer "registration on record" | Reviewers carry a credential | No credential exists in the schema yet (backlog P1-8) | `lib/mocks/incidents.ts` `REVIEWER_ACTOR` |
| **This PR's prototype** — evidence list | Files are attached | File names only; no upload; storage is blocked for signed-in users (P0-1) | — |

## 4. Journey conclusions

| Journey | First hard stop (Agent A) | My conclusion |
|---|---|---|
| A — firm onboarding | A1 (new firm) / A4 (KIMA's firm: no case creation) | Agree. A4 also blocks the incident journey: an incident needs a case |
| B — taxpayer self-service | B2 (no portal account from an application) | Agree on B2. B6 is partial, not a stop (D-1) |
| C — monthly workflow | C2 (no recurring generation) | Agree |
| D — payment discrepancy | D1 | Agree on `main`. On this branch D1–D5 run **on mock data only** at `/[locale]/prototype/incident`; none of it reaches the database. D5 ("never falsely confirms") is enforced by the engine and tested (`npm run test:journey`) |

**Order I recommend for Journey D to reach a real user:** P0-1 and P0-2 (storage,
client write limits) → portal-account creation (B2) → case creation (A4) → payment
states + incident tables (handoff) → reviewer credential (P1-8) → integrate this
prototype into `/app` and `case-detail.tsx`. The prototype does not shorten that chain;
it fixes the contract and the copy so the integration is a rename, not a redesign.
