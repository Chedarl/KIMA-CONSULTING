# User-journey gaps — where each journey stops

*Agent A's trace through the code and the production database (read-only). **Agent B
owns the user-journey conclusions**; this is the technical trace for reconciliation.
Revision `main` @ `26d1ac7`.*

Each step is marked **✓ works**, **~ works with a defect**, or **✗ stops**. "Stops" means
the step cannot be completed by a real signed-in user through the product. Seeded data
does not count.

## Journey A — Accounting firm onboarding

| # | Step | Result | Evidence |
|---|---|---|---|
| A1 | A professional creates a firm workspace | **✗ stops** | The firm option is hidden by owner decision (PR #10). Even before that, a firm application only wrote a `registrations` row. **No screen creates an organisation or a `firm_members` row** (production has 1 seeded member) |
| A2 | Signs in | ~ | Firm OTP works for the seeded member when email delivery is configured. OTP defects in `security-and-integrity-review.md` #4 |
| A3 | Registers a client | ~ | `OnboardingWizard` (`/workspace/clients`) inserts `taxpayers`, an `engagements` row marked `authorized` by the firm itself, and organizer answers. Attaches to the **oldest** organisation. Creates **no contact and no portal account** |
| A4 | Assigns work | **✗ stops** | No screen inserts `compliance_cases`. `WorkQueue` displays `proposeCases()` as proposals only ("nothing here writes to the database"). No screen creates `case_tasks` |
| A5 | Requests documents | ✓ | `CaseDetail` and the wizard insert `document_requests` (on a seeded case) |
| A6 | Client uploads | **✗ stops** | Storage policies admit `anon` only (#1); the client cannot sign in anyway (no portal account, A3) |
| A7 | Reviews submissions | ~ | Three-verdict review works on documents that exist; signed-in preview is refused by storage |
| A8 | Tracks completion | ~ | Dashboard and queue work on seeded cases; "complete"/"filed" wording is misleading (#3) |

**First hard stop: A1 for a new firm; A4 for KIMA's own firm.**

## Journey B — Taxpayer self-service

| # | Step | Result | Evidence |
|---|---|---|---|
| B1 | Registers independently | ~ | `/register` writes a private `registrations` row. In production the full insert fails (`workspace_kind` missing, migration #7) and the fallback drops the workspace kind and service claims |
| B2 | Gets access to their workspace | **✗ stops** | Sign-in needs a `portal_accounts` row with a contact email. **No screen or engine creates one from an application**; the lead triage only changes the application's status |
| B3 | Sees applicable obligations | ~ | Shown only from verified rules: 1 of 14 Cameroon rules is verified, so an IGS taxpayer sees **no** obligation. This is the honesty rule working, not a bug |
| B4 | Uploads documents | **✗ stops** | Storage (#1) |
| B5 | Records progress | **✗ stops** | A client has no way to record a filing or payment attempt; the planned self-reporting (`declared_*`) is not built |
| B6 | Understands the next action | **✗ stops** | The dashboard's "next action" is hard-coded demo text (`lib/i18n.ts:91-95`); `nextBestAction()` is planned (P1-3) |

**First hard stop: B2.**

## Journey C — Monthly compliance workflow (accountant, several taxpayers)

| # | Step | Result | Evidence |
|---|---|---|---|
| C1 | Sees upcoming deadlines across clients | ~ | `/workspace/calendar` from `rules.ts`; honest labels (statutory, prorogued, unconfirmed); almost empty because rules are unverified |
| C2 | Generates this month's work | **✗ stops** | No recurring generation; proposals are not written (A4) |
| C3 | Collects documentation | **✗ stops** | Storage (#1) |
| C4 | Prepares work | ~ | Stage moves on seeded cases; tasks can be ticked, not created |
| C5 | Obtains approval | ~ | `/workspace/reviews` with separation of duties works on seeded cases |
| C6 | Records filing evidence | ~ | `commandRecordFiling` refuses `verified` without an evidence reference. The reference is free text, not a stored document or hash |
| C7 | Delivers | ~ | Can deliver an unfiled case when payment is `not_applicable` (#3) |

**First hard stop: C2.**

## Journey D — Payment discrepancy (debit not recognised)

| # | Step | Result | Evidence |
|---|---|---|---|
| D1 | Taxpayer reports the debit | **✗ stops** | No incident model, table, event kind or screen. Designed only (`docs/strategy/2026-10-27-taxpayer-first/journeys.md` Variant 2) |
| D2 | Records evidence | **✗ stops** | Storage (#1), plus no incident evidence link |
| D3 | Tracks the incident | **✗ stops** | — |
| D4 | Escalation log | **✗ stops** | — |
| D5 | Never falsely confirms the payment | ~ | **Nothing writes `payment_evidence_status` today**, so nothing claims the tax is paid. But a client can forge a `payment_verified` event (#2), and the fee "Paid" pill counts unconfirmed money (#3) |

**First hard stop: D1.**

## What the interface suggests but the backend does not support

- "Report a payment" (client): refused by the database for a real client (N-3).
- "Saved" on the client profile: refused by the database (N-3).
- "Live" badges on case data: realtime does not publish those tables (N-4).
- "Your private workspace is ready" / "isolated tenant": only an application row exists.
- Proposed cases in the work queue look actionable; they cannot be opened.
- The dashboard's next action is fixed demo text.
