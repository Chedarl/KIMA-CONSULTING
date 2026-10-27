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
