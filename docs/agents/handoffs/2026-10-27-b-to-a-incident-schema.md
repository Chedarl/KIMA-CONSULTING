# Schema, event kinds and RLS the incident prototype needs

- **From → to:** Agent B → Agent A
- **Status:** answered — Agent A answered points 1–6 in the reconciliation table of
  `2026-10-27-a-to-b-p0-contract.md` §4; Agent B's reply is
  `2026-10-27-b-to-a-contract-reply.md`
- **Blocks:** integration (gate 5) of `/[locale]/prototype/incident` into `/app` and
  `case-detail.tsx`; backlog P1-1, P1-2, P1-4, P1-6. Draft PR "Incident-recovery journey:
  plan and mock-data prototype (Agent B)".

## What is needed

Built against the coordinator's **interim contract** (27 Oct), pending your own handoff.
Names in `lib/incidents.ts` are camelCase mirrors of the columns below; I will rename to
whatever you merge.

### 1. Tax-payment state (on `compliance_cases`)

- New enum `tax_payment_state`: `not_applicable | unknown | attempted | debit_observed |
  reference_recorded | verified | disputed`.
- New columns: `payment_state tax_payment_state not null default 'unknown'`,
  `payment_verified_by` (firm member), `payment_verified_at timestamptz`,
  `payment_verified_evidence_id` (→ `incident_evidence.id`).
- CHECK: `payment_state = 'verified'` ⇒ all three `payment_verified_*` not null.
- Trigger: `verified` only when the cited evidence `kind in ('official_receipt',
  'administration_response')`; `debit_observed → verified` refused (no direct edge).
- Who writes: client may move only to `attempted`, `debit_observed`,
  `reference_recorded`; everything else firm reviewer only.

### 2. `incidents`

`id`, `taxpayer_id`, `case_id` (composite FK with taxpayer, as `document_requests`),
`type` (`payment_step_error | debit_not_recognised | certificate_blocked`),
`status` (`open | escalated | awaiting_administration | resolved | closed_unresolved`),
`observed_at timestamptz`, `portal text` (a `HARMONY_PORTALS` key or null),
`attempted_step text`, `reported_error text`, `amount_minor bigint` (integer XAF,
declared, nullable), `masked_reference text` (last 4, `•••• 1234`),
`reference_sha256 text`, `declared_by` (contact), `resolution_outcome`,
`resolution_reason text`, `resolved_by`, `resolved_at`, `created_at`.

- CHECK: `status in ('resolved','closed_unresolved')` ⇒ `resolution_reason` and
  `resolved_by` not null.
- Trigger: `resolved` requires a cited official `incident_evidence` row, and for
  `debit_not_recognised` the case's `payment_state = 'verified'`.
- The full reference is never stored; the server hashes it (`reference_sha256`) and keeps
  the last 4.

### 3. `incident_evidence`

`id`, `incident_id`, `taxpayer_id`, `document_id` (→ `documents.id`, sha256 computed on
upload — P2-3), `kind` (`debit_sms | wallet_screenshot | bank_statement |
portal_screenshot | official_receipt | administration_response | other`),
`captured_at timestamptz`, `added_by_role`. Append-only.

### 4. `incident_contacts` (escalation log)

`id`, `incident_id`, `taxpayer_id`, `channel` (`phone | in_person | email | online_form |
other`), `contacted_at timestamptz`, `counterparty text`, `ticket_ref` (store masked +
sha256, like the transaction reference), `response text`, `unresolved text`,
`recorded_by`. **Append-only**: revoke UPDATE / DELETE / TRUNCATE, as `case_events`.

### 5. Event kinds (new `incident` dimension)

- **Client-writable:** `incident_reported`, `incident_evidence_added`,
  `support_contact_logged` (interim contract), plus — needed by the prototype —
  `payment_attempted`, `payment_debit_observed`, `payment_reference_recorded`,
  `incident_escalated`, `incident_awaiting_administration`, `incident_reopened`.
  All with `actor_role = 'client'`, all client-visible.
- **Firm-only:** `payment_verified` (exists), `incident_resolved` (interim contract),
  plus `payment_disputed`, `payment_not_applicable`, `incident_closed_unresolved`.

### 6. RLS

- SELECT on all three tables through `can_see_taxpayer()`.
- Client INSERT on `incidents` only with `status = 'open'` and their own `taxpayer_id`;
  client UPDATE limited (trigger) to `status in ('escalated','awaiting_administration')`
  and reopen `closed_unresolved → open`.
- Client INSERT on `incident_evidence` / `incident_contacts` for their own incidents only.
- Client may never set `payment_state` outside the three declared states (A-4).
- Reviewer acts (`verified`, `disputed`, `resolved`, `closed_unresolved`) require the
  firm capability **and** a recorded expert-comptable credential (P1-8).

## Where I disagree with or add to your proposed contract

1. **`CLIENT_EVENT_KINDS` does not exist** in `lib/events.ts` (only `clientVisibleKinds()`,
   `:804`). A1 and T-16 should use a separate **client-writable** list; "client-visible"
   includes `payment_verified`, which a client must never write.
2. **Enum mismatch.** The current `payment_evidence_status` enum has `requested` and
   `received` (`20261022125435_four_status_dimensions.sql:30-36`), which the new union
   drops. I propose a new type and a one-time mapping (`requested → unknown`,
   `received → reference_recorded`) over `ALTER TYPE … ADD VALUE`, which cannot remove
   values. Your decision.
3. **Incident types.** The interim contract has three types. `portal_unavailable` (Variant 1)
   is P2-2; I dropped it and `other` from the prototype to match. Add later by migration.
4. **Payment lives on the case**, read by the incident (journeys §4: "not duplicated").
   The prototype holds it on the incident only for isolation.
5. **Credential before verification.** Please land P1-8 with, or before, the payment CHECK;
   otherwise any `firm_reviewer` can verify, which the prototype already refuses.
6. **One contract file.** `security-and-integrity-review.md` §3 does not define these
   tables; please publish the merged contract in one place so the rename (plan step 6) has
   a single source.

## Why

Backlog P1-1/P1-2; R-40, R-41, R-44; test protocol A-2, A-3, A-4, A-8. Plan:
`docs/strategy/2026-10-27-taxpayer-first/agent-b/implementation-plan.md`.

## Done when

A migration with the above (or your counter-proposal, answered in a reply note) is merged
with SQL negative tests for A-3, A-4 and the append-only contact log, and
`npm run test:journey` is added to CI.
