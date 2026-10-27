# State machine — incident and tax payment (Agent B)

*The executable version is `lib/incidents.ts`; `scripts/journey-check.mjs` proves the
rules below. If this page and the code disagree, the code is tested and this page is
wrong — fix it.*

## 1. Tax-payment state (`PaymentState`)

Union from backlog P1-1 and the strategy contract:
`not_applicable`, `unknown`, `attempted`, `debit_observed`, `reference_recorded`,
`verified`, `disputed`.

```mermaid
stateDiagram-v2
    [*] --> unknown
    unknown --> attempted: taxpayer (declared)
    unknown --> debit_observed: taxpayer (declared)
    unknown --> not_applicable: reviewer
    not_applicable --> unknown: reviewer
    attempted --> debit_observed: taxpayer (declared)
    attempted --> reference_recorded: taxpayer (declared)
    attempted --> unknown: reviewer
    debit_observed --> reference_recorded: taxpayer (declared)
    debit_observed --> disputed: reviewer
    reference_recorded --> verified: reviewer + credential + OFFICIAL evidence
    reference_recorded --> disputed: reviewer
    disputed --> verified: reviewer + credential + OFFICIAL evidence
    disputed --> reference_recorded: reviewer
    verified --> [*]
```

| From | To | Who | Requires |
|---|---|---|---|
| `unknown` | `attempted`, `debit_observed` | taxpayer or reviewer | — (taxpayer's act is `declared`) |
| `unknown` | `not_applicable` | reviewer | credential |
| `attempted` | `debit_observed`, `reference_recorded` | taxpayer or reviewer | — |
| `attempted` | `unknown` | reviewer | credential |
| `debit_observed` | `reference_recorded` | taxpayer or reviewer | a reference ≥ 4 characters (masked at once) |
| `debit_observed` | `disputed` | reviewer | credential; **no waiting period** (owner decision D5) |
| `debit_observed` | **`verified`** | **nobody** | **no edge — a debit alone never reaches verified** |
| `reference_recorded`, `disputed` | `verified` | reviewer | credential **and** ≥ 1 cited evidence of kind `official_receipt` or `administration_response` |
| `reference_recorded` | `disputed` | reviewer | credential; **no waiting period** (owner decision D5) |
| `disputed` | `reference_recorded` | reviewer | credential |
| `verified` | — | — | terminal |

Evidence kinds: `debit_sms`, `wallet_screenshot`, `bank_statement`, `portal_screenshot`,
`other` are the taxpayer's own record and **never** verify. Only `official_receipt` and
`administration_response` are "official". A taxpayer may *attach* an official receipt;
only a reviewer may *cite* it to verify.

**Mapping to today's schema.** `compliance_cases.payment_evidence_status` is the enum
`not_applicable, unknown, requested, received, verified`
(`supabase/migrations/20261022125435_four_status_dimensions.sql:30-36`,
`lib/cases.ts:76-81`). `requested` / `received` cannot express a debit versus a receipt.
Proposed to Agent A: a new enum for this union (see the handoff), with `requested` →
`unknown` and `received` → `reference_recorded` as the migration mapping, decided by A.

## 2. Incident status (`IncidentStatus`)

`open`, `escalated`, `awaiting_administration`, `resolved`, `closed_unresolved`.

```mermaid
stateDiagram-v2
    [*] --> open: taxpayer reports (declared)
    open --> awaiting_administration: first contact logged / taxpayer
    open --> escalated: taxpayer or reviewer
    escalated --> awaiting_administration: taxpayer or reviewer
    awaiting_administration --> escalated: no answer / taxpayer or reviewer
    open --> resolved: reviewer
    escalated --> resolved: reviewer
    awaiting_administration --> resolved: reviewer
    open --> closed_unresolved: reviewer + reason
    escalated --> closed_unresolved: reviewer + reason
    awaiting_administration --> closed_unresolved: reviewer + reason
    closed_unresolved --> open: taxpayer or reviewer (reopen)
    resolved --> [*]
```

| To | Who | Requires |
|---|---|---|
| `escalated`, `awaiting_administration` | taxpayer or reviewer | — |
| `open` (reopen from `closed_unresolved`) | taxpayer or reviewer | — |
| **`resolved`** | **reviewer only** | credential; a resolution reason; ≥ 1 cited **official** evidence; for `debit_not_recognised` (including a switched `payment_step_error`, §2a), payment already `verified` |
| `closed_unresolved` | reviewer only | credential; a reason |

`resolved` is terminal: every act on a resolved incident is refused (`closed`).

## 2a. Incident type switch (owner decision D4, 27 Oct 2026)

A `payment_step_error` incident whose payment first enters a state that shows a
debit (`debit_observed` or `reference_recorded`; `disputed` and `verified` are only
reachable through them) becomes `debit_not_recognised`.

| Rule | Where it is held |
|---|---|
| The switch happens in the same act that records the debit, after its `payment_changed` event | `recordPayment()` → `switchTypeOnDebit()` in `lib/incidents.ts` |
| It is recorded as **one** `incident_type_changed` event, `from: payment_step_error`, `to: debit_not_recognised`, with the basis of the act that caused it (`declared` for the taxpayer, `recorded` for a reviewer) | D4-a, D4-b |
| It runs one way only and never twice; `certificate_blocked` never switches | D4-a, D4-b |
| From then on the resolve gate applies: `resolved` needs the payment `verified` by a credentialed reviewer | `requiresVerifiedPayment()`; D4-c |
| A row that already shows a debit but was never switched is gated the same way: the gate follows the money, not only the label | `requiresVerifiedPayment()`; D4-c |
| Nobody sets the type by hand after the incident is reported | no act in the engine changes `type` except the switch |

The screen shows the new type in the incident title, a notice that a debit was
recorded and that a reviewer must verify the payment before closing, and the switch
in the history.

## 3. Basis of every act

| Actor | Act | Basis recorded |
|---|---|---|
| taxpayer | anything | `declared` — shown "You reported" |
| reviewer | `verified`, `resolved` | `verified` — shown "Verified by a reviewer", reviewer named |
| reviewer | anything else | `recorded` |

## 4. Refusals (the UI shows each in FR and EN)

`not_allowed`, `reviewer_required`, `reviewer_not_credentialed`, `evidence_required`,
`official_evidence_required`, `payment_not_verified`, `reason_required`, `closed`.

## 5. Questions

1. **Closed — owner decision D4 (27 Oct 2026).** When a `payment_step_error`
   incident gets a debit, its type becomes `debit_not_recognised` and the switch is
   recorded as an event; the resolve gate (payment must be `verified`) applies from
   then on. See §2a. Agent A reflects it in the schema
   (`docs/agents/handoffs/2026-10-27-b-to-a-contract-reply.md`).
2. **Closed — owner decision D5 (27 Oct 2026).** There is no fixed waiting period
   before `disputed`. A credentialed reviewer judges when to dispute. No screen, next
   action or copy shows a number of days until research item S-3 finds the official
   DGI/Trésor procedure; journey check D5-b enforces it.
3. Where the payment state lives: on the case (journeys §4, "not duplicated") or on the
   incident. The prototype carries it on the incident for isolation; the handoff asks for
   it on the case, with the incident reading it.
