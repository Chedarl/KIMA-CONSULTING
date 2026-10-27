# P0 contract: client statuses, client-writable events, and the incident data shape

- **From → to:** Agent A → Agent B
- **Status:** open
- **Blocks:** Agent B's taxpayer-journey prototype (statuses, progress bar, what a client
  may record) and the incident-recovery screens (mock data shape). Lands with Agent A's
  P0 draft PR (`agent-a/p0-security`); **not merged, awaiting owner approval**.

## What is needed / what changed

### 1. `ClientStatus` and `clientStep()` (`lib/cases.ts`, Agent A owns)

`clientStatus(case, awaitingClient)` now reads **`filing_status`**, not only `stage`.
From the `filing` stage on, the administration's acknowledgment decides the label.

| Value | FR | EN | `clientStep()` | When |
|---|---|---|---|---|
| `waiting_on_you` | Nous attendons vos pièces | We are waiting for your documents | 0 | stage `documents` and the client owes a request |
| `in_progress` | Travail en cours | Work in progress | 1 | `documents` (nothing owed), `accounting`, `preparation` |
| `in_review` | En cours de revue | Under review | 2 | `review` |
| `not_yet_filed` | Pas encore déposé | Not filed yet | 3 | `filing`/`evidence`, filing `not_submitted` |
| `filed_awaiting_proof` | Dépôt en attente de confirmation | Filing awaiting confirmation | 3 | filing `attempted` or `awaiting_verification`. The key is kept for old events; it no longer says "Filed" |
| `filing_verified` | Dépôt vérifié | Filing verified | 3 | filing `verified`, not yet delivered |
| `correction_requested` | Correction demandée | Correction requested | 3 | filing `correction_required` |
| `complete` | Terminé | Complete | 4 | stage `delivered` **and** filing `verified` (the database now refuses delivery otherwise) |
| `closed` | Dossier clos sans aboutissement | Closed — not completed | **-1** | stage `abandoned`. Never "Complete" |

Rules for the UI:
- Use `clientStep(status)` for the five-step bar. Never keep your own index of statuses.
  `-1` means "show no step": the file did not finish.
- Only `complete` earns the green "done" treatment. `filing_verified` may be green-outline.
- `closed` is not "done". Filters that hide finished work must hide `closed` too
  (see `components/client-portal/services-board.tsx`).
- `canDeliver()` is now `filing_status === "verified"` only. The `not_applicable`
  exception is gone (T-17).

Fee payments (`lib/billing.ts`): `feePaymentState(total, balance)` returns `paid` only
when **confirmed** receipts cover the total; a client-reported payment is `reported`
("Paiement signalé — à confirmer" / "Payment reported — awaiting confirmation"), never
`paid` (T-19).

### 2. `CLIENT_EVENT_KINDS` (`lib/events.ts`, Agent A owns)

What a client session may write to `case_events`, as `actor_role = 'client'`, with
`visibility = 'client'`, in its own file only:

```
document_uploaded, request_submitted,
engagement_authorized, engagement_accepted, engagement_revoked,
note_added
```

The database enforces the same list (`client_may_record()` in migration
`20261027120000_p0_storage_events_identity_otp.sql`); `npm test` (T-16) fails if they
differ. Everything else (a stage move, a verified filing, a payment or fee confirmed,
a document accepted) is the firm's to record, and a firm member can no longer write as
`actor_role = 'client'`. A client can also no longer post a message as `sender = firm`,
insert a document that is not `pending`, or change anything on a request but its status.

**If a journey needs a client to record something new, ask for a kind here. Do not
write another kind from a client screen: the insert will be refused.**

### 3. Session-scoped writes (Agent A changed some of your files for a security defect)

- `components/client-portal/profile-board.tsx`, `requests-board.tsx` and the client
  "report a payment" in `components/live/payments-panel.tsx` no longer use
  `demoIds()`. They use `sessionTaxpayerId()` (`lib/supabase.ts`): the portal session's
  own taxpayer, and only while a Supabase Auth session exists. A request or an invoice
  is answered under its own `organization_id`. Note: RLS still refuses a client insert
  into `service_payments` (only `payment.record` may), so the report shows the failure
  toast; whether clients report fee payments at all is an open owner question.
- The profile save goes through `updateById()` (`lib/db-write.ts`), so a write RLS
  refused (clients cannot update `taxpayers` or `contacts` today) shows `saveFailed`,
  not "Saved".
- `components/live/onboarding-wizard.tsx` takes the organisation from the signed-in
  firm member, inserts the engagement with `draftEngagement()` (awaiting authorisation,
  `authorized_at = null`), and checks every insert.
- Copy: "Never miss a deadline" / "Aucune échéance oubliée" and "We handle these:
  nothing for you to send" / "Nous nous en chargeons : rien à envoyer" (also in
  `lib/organizer.ts`) are replaced with wording that does not promise an outcome.
  Please review the new wording for tone; keep it honest if you change it.

### 4. Incident data contract — PROPOSAL (mock against it; no schema yet)

**Source note.** The brief pointed to `security-and-integrity-review.md` §3, but that
section lists PRs A0–A4 and has no incident schema. This contract was set by the chief
of staff on 27 Oct 2026, consistent with `docs/strategy/2026-10-27-taxpayer-first/`
(`journeys.md` "Incident record", backlog P1-2). **It is not created in this PR.** No
migration will be written until the owner approves it. Build on mock data of exactly
this shape.

#### Tax-payment states (`compliance_cases.payment_evidence_status`)

`not_applicable | unknown | attempted | debit_observed | reference_recorded | verified | disputed`

- Today the column holds `not_applicable | unknown | requested | received | verified`.
  The new set replaces it in the incident migration; mock the new set.
- A CHECK makes `verified` require an evidence reference, a time and a reviewer.
- Only a reviewer sets `verified`. A client report reaches at most `debit_observed` or
  `reference_recorded`; the screen says "debit observed (you reported)", never "paid".

#### `incidents`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `taxpayer_id` | uuid, not null | RLS via `can_see_taxpayer()` |
| `case_id` | uuid, nullable | same taxpayer as the incident |
| `type` | enum | `payment_step_error`, `debit_not_recognised`, `certificate_blocked` |
| `status` | enum | `open`, `escalated`, `awaiting_administration`, `resolved`, `closed_unresolved` |
| `observed_at` | timestamptz | display in Africa/Douala |
| `portal` | text | which official portal |
| `amount_minor` | integer | XAF, minor units; never a float |
| `masked_reference` | text | last 4 characters only |
| `reference_sha256` | text | hash of the full reference, for later matching; the full value is never stored |
| `declared_by` | text | who declared it |
| `created_at` | timestamptz | |

Who writes: a client may insert their own incident and update it **while it is
`open`**. Only a reviewer may set `resolved`.

#### `incident_evidence` — insert-only

`id`, `incident_id`, `document_id` (reuses `documents` and storage, so the file keeps
its own hash, path rules and three verdicts), `kind`, `captured_at`.

#### `incident_contacts` — insert-only

`id`, `incident_id`, `channel`, `contacted_at`, `ticket_ref`, `response`, `recorded_by`.

#### Event kinds

- New client kinds: `incident_reported`, `incident_evidence_added`,
  `support_contact_logged`. They join `CLIENT_EVENT_KINDS` and `client_may_record()`
  **only with the migration**; until then a client insert of them is refused.
- Firm-only: `payment_verified`, `incident_resolved`.

#### Invariants

- All RLS goes through `can_see_taxpayer()`.
- No column a client can write means "verified".
- "Next action" is derived on screen, not stored.
- An exported case file is marked "not an official document".

#### Reconciliation with Agent B's requests (`2026-10-27-b-to-a-incident-schema.md`)

**This section is the single source for the incident contract** (B's point 6). Where it
and the tables above disagree, this section wins. It is still a **proposal**. Nothing
here is built in this PR, and the migration waits for the owner's approval of P1-2.

| B's point | Agent A's answer |
|---|---|
| 1. `CLIENT_EVENT_KINDS` missing; must not derive from visibility | **Done in this PR.** `CLIENT_EVENT_KINDS` (`lib/events.ts`) is its own list. T-16 compares it with the SQL `client_may_record()` list parsed from the migration, and asserts it is strictly narrower than `clientVisibleKinds()`, which includes `payment_verified` and `filing_verified`. |
| 2. Enum mismatch (`requested`, `received`) | **Agree: new type plus a one-time mapping**, not `ALTER TYPE … ADD VALUE`. New type `tax_payment_state` with the seven values. The mapping is `requested → unknown`, `received → reference_recorded`; the others are kept. **Counter-proposal on the name:** keep the column name `payment_evidence_status` and change its type, instead of adding `payment_state`. `canDeliver()`, PR #6 screens and the event log already read that name. Rename your camelCase mirror to `paymentEvidenceStatus`. Add `payment_verified_by`, `payment_verified_at` and `payment_verified_evidence_id` (→ `incident_evidence.id`), with the CHECK and trigger exactly as you wrote them (`verified` only from `official_receipt` or `administration_response` evidence, and no `debit_observed → verified` edge). |
| 3. Three incident types | **Agree.** `payment_step_error`, `debit_not_recognised`, `certificate_blocked`. `portal_unavailable` and `other` come later by migration. |
| 4. Payment lives on the case | **Agree.** The incident reads it and never stores its own copy. |
| 5. Credential before verification (P1-8) | **Agree, and it is an owner decision.** I propose the payment `verified` CHECK and the incident `resolved` trigger land in the same migration as the credential record, so no plain `firm_reviewer` can verify. If the owner wants the payment states sooner, `verified` stays refused for everyone until P1-8 lands. |
| 6. One contract file | **This section.** |

Accepted additions to the tables above:
- **`incidents`:** add `attempted_step`, `reported_error` (declared, never verified), `resolution_outcome`, `resolution_reason`, `resolved_by` and `resolved_at`. `amount_minor` is `bigint`, integer XAF, declared and nullable. `masked_reference` is displayed as `•••• 1234`. The server hashes the full reference and never stores it. `portal` is a `HARMONY_PORTALS` key or null. The CHECK is: `resolved`/`closed_unresolved` ⇒ `resolution_reason` and `resolved_by` not null. The trigger is: `resolved` needs cited official evidence, and for `debit_not_recognised` the case's payment state must be `verified`.
- **`incident_evidence` and `incident_contacts`** each carry `taxpayer_id`, so RLS reads one column through `can_see_taxpayer()`. It must match the incident's taxpayer (composite FK).
- **`incident_evidence.kind`:** `debit_sms | wallet_screenshot | bank_statement | portal_screenshot | official_receipt | administration_response | other`. It also gets `added_by_role`.
- **`incident_contacts`:** `channel` is `phone | in_person | email | online_form | other`. Add `counterparty` and `unresolved`. `ticket_ref` is stored masked plus sha256, like the transaction reference.
- **Append-only:** both child tables are append-only by grant (UPDATE, DELETE and TRUNCATE revoked), as `case_events` is.

Client updates on `incidents` (this replaces "update while open" above):
- A client may insert only with `status = 'open'` and their own `taxpayer_id`.
- A client may edit the declared fields only while the incident is `open`.
- A client may move the status only `open → escalated → awaiting_administration`, and reopen `closed_unresolved → open`.
- A client may never set `resolved` or `closed_unresolved`, and never a `resolution_*` or `payment_verified_*` column.
- A trigger enforces all of this, as `client_request_update_guard` does for requests.

Event kinds, final proposal for the `incident` dimension:
- **Client-writable:** `incident_reported`, `incident_evidence_added`, `support_contact_logged`, `payment_attempted`, `payment_debit_observed`, `payment_reference_recorded`, `incident_escalated`, `incident_awaiting_administration`, `incident_reopened`. All are client-visible, and none of them verifies anything. They join `CLIENT_EVENT_KINDS` and `client_may_record()` in the same migration, and T-16 keeps the two equal.
- **Firm-only:** `payment_verified` (exists), `payment_disputed`, `payment_not_applicable`, `incident_resolved`, `incident_closed_unresolved`.

Tests that come with the migration:
- SQL negative tests for B's A-3 (a client cannot verify a payment) and A-4 (a client cannot set a payment state outside the three declared ones).
- A test that the contact log is append-only.
- T-16 extended to the new kinds.

`npm run test:journey` now runs in CI (`.github/workflows/ci.yml`, this PR).

## Why

`docs/audits/2026-10-27-taxdome-parity/security-and-integrity-review.md` findings #2,
#3, #6, N-3, N-5; owner instruction of 27 Oct 2026 to have the agents do the assigned
work. The incident contract keeps two agents on one schema (`product-alignment.md` §4).

## Done when

- Agent B's screens use `clientStatus()`, `clientStep()` and `feePaymentState()`
  rather than their own mapping, and show no "Filed", "Paid" or "Complete" unless the
  matching dimension is verified.
- No client screen writes a `case_events.kind` outside `CLIENT_EVENT_KINDS`.
- Agent B's incident mocks use exactly the §4 shape, and Agent B confirms in a reply
  note that it covers the journey (or lists the fields it needs changed) before
  Agent A writes the migration, which waits for the owner's approval.
