# C — Journeys, state diagrams and swimlanes

Three failure journeys from the brief (§6, §10), for one fictional taxpayer:
**Boutique Ndolo (synthetic)**, a Douala trader declared under the IGS. Nothing below
asserts a rate, deadline, payment route or portal as fact. Where a step depends on DGI
practice, its status is given and the screen would say the same.

## 1. Who controls what

| Step | Controlled by | KIMA's role |
|---|---|---|
| Whether an obligation exists, its amount and date | Law + DGI (art. 16 prorogations by MINFI) | Show it only from a `verified` rule; otherwise "not yet confirmed" |
| Portal availability, sessions, OTP, payment processing | DGI / Trésor / mobile-money operator | None. Record what happened |
| Filing acknowledgment, quittance, payment reconciliation | DGI / Trésor | None. Hold the evidence; a reviewer records it as verified |
| ACF issuance (`fanr.harmony2.cm`, `inferred`) | DGI | None. Never issue, imitate or predict |
| The taxpayer's record, the next step, the case file, escalation guidance | **KIMA** | Full |
| Moving any dimension to `verified` | **A KIMA reviewer** (blueprint §20 rule 11) | Full, on evidence only |

## 2. What evidence moves which status

Five dimensions, never collapsed into one badge. **Taxpayer entries are declarations;
only a reviewer with the cited evidence produces `verified`.**

| Dimension | States (proposed) | Moves to `verified` only on | Who |
|---|---|---|---|
| KIMA work stage | existing `CaseStage` | (not evidence-based — workflow) | Firm |
| Filing acknowledgment | `not_submitted → attempted → awaiting_verification → verified` / `correction_required` (existing) | DGI acknowledgment of submission (document or reference + capture date + source) | Reviewer |
| Tax payment | `not_applicable`, `unknown`, `debit_observed`*, `reference_recorded`*, `verified`, `disputed` | Official quittance / DGI receipt — **never** a wallet SMS or bank debit alone | Reviewer |
| Firm fee | existing `BillingStatus`; pending ≠ paid | Confirmed payment with evidence (existing CHECK) | Firm |
| Certificate (ACF) | `not_requested`, `requested`*, `blocked`*, `obtained`, `expired` | The ACF document itself, authenticity checked by a person on the DGI's own service | Reviewer |

\* declared state: may be set by the taxpayer, shown as "you reported".

## 3. Variant 1 — payment-stage portal error before the deadline

### State

```mermaid
stateDiagram-v2
    [*] --> Ready: verified obligation shown — (or "not yet confirmed")
    Ready --> Attempted: taxpayer starts on the DGI portal
    Attempted --> IncidentOpen: error at payment step — taxpayer records it
    IncidentOpen --> Attempted: safe retry (guidance: only if no debit observed)
    IncidentOpen --> Escalated: still failing / deadline near — support route shown
    Attempted --> AwaitingVerification: taxpayer uploads acknowledgment
    Escalated --> AwaitingVerification: acknowledgment obtained later
    AwaitingVerification --> Verified: reviewer checks evidence
    AwaitingVerification --> Attempted: evidence insufficient (reason given)
    Verified --> [*]
```

Filing stays `attempted` throughout the incident. A deadline-risk warning appears when the
incident is open within N days of a *verified* due date; it never says the deadline will
be extended.

### Swimlane

```mermaid
sequenceDiagram
    actor T as Taxpayer
    participant K as KIMA
    participant D as DGI portal (not KIMA)
    actor R as KIMA reviewer
    T->>K: Open obligation
    K-->>T: Status + one next action + official source (or "unverified")
    T->>D: Declare, proceed to payment
    D-->>T: Error at payment step
    T->>K: Record incident: step, time, message, screenshot, network
    K-->>T: Filing = attempted (not filed). Next action: check for debit before any retry
    alt no debit observed
        T->>D: Retry later
    else debit observed
        K-->>T: Switch to Variant 2 — do not pay again
    end
    T->>K: Upload acknowledgment
    R->>K: Verify against evidence
    K-->>T: Filing verified (payment dimension unchanged)
```

## 4. Variant 2 — funds debited, payment not recognised *(first build slice)*

### State (tax-payment dimension)

```mermaid
stateDiagram-v2
    [*] --> Unknown
    Unknown --> DebitObserved: taxpayer reports wallet/bank debit
    DebitObserved --> ReferenceRecorded: transaction reference recorded (masked)
    ReferenceRecorded --> Verified: reviewer sees official quittance / DGI receipt
    ReferenceRecorded --> Disputed: DGI shows unpaid after the waiting period — (period: unknown — research item S-3)
    Disputed --> Verified: reconciliation evidence obtained
    Disputed --> Disputed: each support contact logged
    Verified --> [*]
    note right of DebitObserved
      Never "paid".
      Next action: keep the SMS/receipt,
      do NOT pay again without
      verified guidance.
    end note
```

### Incident record (checked against the existing schema)

| Brief field | Exists? | Proposal |
|---|---|---|
| case_id, taxpayer_id, obligation/period | yes — `compliance_cases` | FK, composite with taxpayer as `document_requests` does |
| incident_type | no | enum: `portal_unavailable`, `payment_step_error`, `debit_not_recognised`, `certificate_blocked`, `other` |
| detected_at with tz | pattern in `lib/dates.ts` | `timestamptz`, entered in Africa/Douala |
| portal, attempted_step | portal keys in `lib/rules.ts:897-940` | `portal_key` + free-text step |
| user-reported error | no | text, declared |
| evidence references | `documents` | join table to `documents` (hashed) |
| transaction ref (masked) | no | stored masked (last 4) + sha256 of the full value for later matching |
| submission ack / payment status | case dimensions | **not duplicated** — read from the case |
| support ticket, contacts | no | `incident_contacts` rows: channel, when, reference, response |
| owner, escalation status, next action | `compliance_cases.owner` pattern | `status` state machine; next action is derived, not stored |
| provenance, last_verified_at | event log | events in a new `incident` dimension; `verified_by`/`verified_at` only on reviewer acts |
| resolution outcome | no | `resolution` enum + reason, required to close |

### Swimlane

```mermaid
sequenceDiagram
    actor T as Taxpayer
    participant K as KIMA
    participant P as Wallet / bank (not KIMA)
    participant D as DGI / Trésor (not KIMA)
    actor R as KIMA reviewer
    T->>D: Pay (route per verified guidance only)
    P-->>T: Debit SMS
    D-->>T: Still unpaid / no quittance
    T->>K: "I was debited" + SMS screenshot + reference
    K-->>T: Payment = debit observed (you reported). Not paid. Don't pay again.
    K-->>T: Next action: request receipt via official channel (source / or "unverified")
    T->>D: Contact support
    T->>K: Log contact (channel, time, ticket no., answer)
    K-->>R: Case flagged: payment disputed, deadline risk
    D-->>T: Quittance eventually issued
    T->>K: Upload quittance
    R->>K: Verify, payment verified
    K-->>T: Export case file (marked "not an official document")
```

## 5. Variant 3 — filed and paid, ACF blocked

### State (certificate dimension)

```mermaid
stateDiagram-v2
    [*] --> NotRequested
    NotRequested --> Requested: taxpayer applies on the DGI service
    Requested --> Obtained: ACF uploaded, reviewer checks authenticity on the DGI service
    Requested --> Blocked: refusal / identifier mismatch reported
    Blocked --> Requested: after resolution step
    Obtained --> Expired: validity ends (period: inferred ~3 months — S-4)
    note right of Blocked
      Precondition check shown:
      filing verified? payment verified?
      If either is not, that is the next action —
      not "the DGI is wrong".
    end note
```

KIMA never renders a certificate, a seal, a QR code or the word "conforme". The case
file says, verbatim, "This is not an Attestation de Conformité Fiscale."

### Swimlane

```mermaid
sequenceDiagram
    actor T as Taxpayer
    participant K as KIMA
    participant D as DGI ACF service (not KIMA)
    actor R as KIMA reviewer
    T->>D: Request ACF
    D-->>T: Refused / declaration id not recognised
    T->>K: Record incident (certificate_blocked) + screenshot
    K-->>T: Shows filing and payment dimensions side by side
    alt filing or payment not verified
        K-->>T: Next action: get that evidence first
    else both verified
        K-->>T: Next action: support route with case file (identifiers, quittances)
        T->>D: Escalate with case file
        T->>K: Log contact and answer
    end
    D-->>T: ACF issued
    T->>K: Upload ACF
    R->>K: Authenticity checked on DGI service, certificate obtained
```

## 6. The firm's side

The same rows, read by `case-detail.tsx`: an open incident is a blocker (via
`deriveBlocker`), a `disputed` payment raises `risk()`, and only the reviewer's actions
move a dimension to `verified`. The taxpayer never needs to wait for the firm to *record*
anything — only to have it *confirmed*.
