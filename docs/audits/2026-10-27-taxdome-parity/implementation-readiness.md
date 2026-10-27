# Implementation readiness — verified status of every major module

*Agent A owns these technical-readiness conclusions. Revision: `main` @ `26d1ac7`.
Production database inspected read-only.*

## Classification rules used

- **WORKING** — the end-to-end path works for a real signed-in user **and** meaningful
  tests cover it. A UI that renders, or TypeScript that compiles, is not enough.
- **PARTIAL** — part of the workflow works; a step is missing.
- **PROTOTYPE** — a screen or demo logic exists; it reads data that was seeded, not created through the product.
- **PLANNED** — documented; no implementation.
- **MISSING** — no implementation and no approved design.
- **BLOCKED** — implemented, but cannot be used safely (security, integrity or regulatory).

**The headline:** nothing in KIMA is **WORKING** under this rule, because the only
automated tests are 9 pure-engine checks. The engines are good. **No end-to-end path
has a test**, and several paths stop at a database permission the UI does not handle.

## Engines (`lib/`) — the strongest part of the codebase

| Engine | What it does | Tests | Verdict |
|---|---|---|---|
| `rules.ts` | CEMAC rule packs: 14 Cameroon rules, **1 verified** (PATENTE_RENEWAL); unverified rules are inactive by construction; prorogations; `resolveDueDate()` | 3 checks, two of them weakened by an invalid fixture (`type: "sarl"`) | Engine sound. Output is thin: an IGS taxpayer gets **zero** active obligations |
| `cases.ts` | One obligation × taxpayer × period. Stage gate, four dimensions, `recordFiling()` evidence gate, `canDeliver()`, `proposeCases()` | 3 checks | Sound, except `clientStatus()` and `canDeliver()` (security review #3) |
| `events.ts` | Append-only log, 34 kinds, visibility derived from the kind, `drift()` | Indirect | Sound; the database does not enforce who may write which kind (#2) |
| `permissions.ts` | Capability matrix mirrored in SQL; separation of duties; `kima_admin` has no professional authority | 2 checks | Sound. No organisation scope |
| `document-review.ts` | Three verdicts; an unverified rule escalates, never decides | 1 check | Sound |
| `registration.ts`, `public-onboarding.ts` | Application lifecycle, intake claims | 2 checks | Sound |
| `crm.ts`, `organizer.ts`, `document-naming.ts`, `diagnostics.ts` | Segments and links; intake → documents; folder grammar; pre-approval checks | **None** | Untested |

## Modules (user-facing)

| Module | Firm side | Client side | Database support | Verdict | Where it stops |
|---|---|---|---|---|---|
| **Firm sign-in (OTP)** | `/firm-login` → `/api/firm/*-code` | — | `firm_issue_code` / `firm_verify_code` | **PARTIAL** | Works with email delivery configured. Security defects #4 / N-1 |
| **Client sign-in (OTP)** | — | `/login` → `/api/portal/*-code` | `portal_*_code` | **PARTIAL** | Works only for a `portal_accounts` row, and **no screen creates one** |
| **Public registration** | `/workspace/leads` (triage, `transition()`) | `/register` | `registrations` | **PARTIAL** | Saves an application. Production lacks `workspace_kind` (migration #7). **No conversion** from application to taxpayer, contact or portal account |
| **Firm creates a client** | `OnboardingWizard` in `/workspace/clients` | — | `taxpayers`, `engagements`, `organizer_answers`, `document_requests` | **PARTIAL** | Creates the taxpayer and requests. Attaches to the oldest organisation; self-authorises the engagement; creates **no contact and no portal account** |
| **CRM** (contacts, links, tags, segments) | `/workspace/clients`, `Client360` | — | `contacts`, `contact_account_links`, `tags`, `account_tags` | **PROTOTYPE** | Read-only views. **No screen creates a contact, a link or a tag** |
| **Compliance cases (pipeline)** | `/workspace/cases/[id]` — advance, record filing; `/workspace/queue` | `/app/declarations` | `compliance_cases` (insert policy exists) | **PARTIAL** | Cases can be moved but **not opened**: `WorkQueue` shows `proposeCases()` as proposals and writes nothing. All 4 production cases are seeded |
| **Tasks** | Ticked in `CaseDetail` | — | `case_tasks` | **PROTOTYPE** | Update only; **no screen creates a task**; no assignment, due date or dependency UI |
| **Document requests** | Created in `CaseDetail` and the wizard | `/app/requests`, `/app/documents` | `document_requests` | **PARTIAL** | Creation works. The client may edit any column (N-2) |
| **Document upload and storage** | Inbox preview, copy | Upload in the requests board | `storage.objects` (`kima-demo`) | **BLOCKED** | Anon-wide policies; signed-in upload and preview refused (#1) |
| **Document review (three verdicts)** | `/workspace/inbox`, `DocumentVerdicts` | Received ≠ accepted shown | `documents.acceptance` | **PARTIAL** | Engine and screen work; a file cannot be previewed by a signed-in reviewer (#1); clients can pre-set verdicts (N-2) |
| **Professional review / approval** | `/workspace/reviews` (separation of duties, diagnostics) | — | `compliance_cases.approved_by`, CHECK on self-approval | **PARTIAL** | Works on seeded cases. Reviewer is a role, not a credentialed expert-comptable (backlog P1-8) |
| **Filing evidence** | `recordFiling` in `CaseDetail` | Archive shows only verified filings | CHECK `filing_verified_requires_evidence` | **PARTIAL** | Evidence is a free-text reference, not linked to a document or hash |
| **Tax payment status** | Shown | Shown | Enum only; no engine, no CHECK | **PLANNED** | `payment_verified` is never written |
| **Messages** | `/workspace/messages` | `/app/messages` | `messages` (realtime) | **PARTIAL** | Works; a client can post as the firm (N-2) |
| **Case history / timeline** | Dashboard feed, case detail | Client feed (client-visible only) | `case_events` | **BLOCKED** (as evidence) | Forgeable by clients (#2). Fine as display, unusable as a record of fact |
| **Deadline calendar** | `/workspace/calendar` | `/app/calendar` | `rules.ts` (code, not DB) | **PARTIAL** | Labels statutory, prorogued and unconfirmed honestly; shows almost nothing for IGS (1/14 rules verified) |
| **Billing — firm** | Not on `main`; `/workspace/billing` is in open PR #6 | — | `invoices` (no insert policy), `service_payments` | **MISSING** on `main` (PR #6 pending) | No invoice can be issued anywhere |
| **Billing — client** | — | `/app/payments` | `service_payments` insert = firm only | **BLOCKED** | "Report a payment" is refused by the database for a real client (N-3); pending money shown as "Paid" (#3) |
| **Engagements / proposals** | Client 360 embed; list in PR #6 | — | `engagements` (authorised / accepted / revoked timestamps) | **PARTIAL** | No proposal, engagement letter or client acceptance flow |
| **E-signatures** | — | — | — | **MISSING** | — |
| **Automation** (triggers, reminders, recurring work, notifications) | — | — | — | **MISSING** | No scheduler, no job, no reminder email; `proposeCases()` is the only seed of recurrence |
| **Email** | — | OTP codes, contact form (Resend) | — | **PARTIAL** | Transactional only; no conversation history |
| **Reporting / KPIs** | `FirmDashboard`, `registration_kpis` RPC | — | — | **PARTIAL** | Counts and risk on the dashboard; no reports, exports or time data |
| **Team management** | Firm session shows capabilities | — | `firm_members` (1 row), `role_capabilities` | **PARTIAL** | Roles and capabilities work. **No screen invites or deactivates a member**; no workload view; no organisation scope |
| **Audit log** | — | — | `audit_events` (firm insert only) | **PARTIAL** | Client-side audit writes are silently refused (N-3); no screen reads the log |
| **Organizer / intake questionnaire** | Wizard | Public onboarding | `organizer_answers` | **PARTIAL** | One fixed questionnaire; no templates |
| **DSF bridge** (`declarations`, `validation_findings`) | — | — | Tables exist (3 rows seeded) | **PROTOTYPE** | No ingestion, no screen |
| **Integrations** | — | — | — | **MISSING** (by design for the DGI) | Only Resend. No accounting system, no payment provider, no API. **No DGI integration, correctly** |
| **Mobile** | Responsive | Responsive; mobile nav | — | **PARTIAL** | Layout tested at 4 widths per README; no camera capture, no offline, no slow-network measurement |
| **Incident recovery** | — | — | — | **PLANNED** | `docs/strategy/2026-10-27-taxpayer-first/` (P1-1…P1-6) |
| **Official-text news** | — | — | — | **PLANNED** | Backlog P1-9 |
| **Certificate (ACF) status** | — | — | — | **PLANNED** | Backlog P2-1 |

## Technical dependencies (what blocks what)

1. **Migration pipeline (#7)** blocks every schema change, including every security fix.
2. **Storage (#1)** blocks document exchange, which blocks review, filing evidence and incident evidence.
3. **Event integrity (#2)** blocks using the timeline as evidence, so it blocks incident recovery.
4. **Case creation, portal-account creation and task creation** are missing writes, not
   missing engines. The engines exist (`proposeCases`, `registration.transition`);
   what is missing is a screen that writes.
5. **Organisation scoping** blocks a second firm, and therefore any multi-firm, TaxDome-like offering.
6. **Tests:** without database and end-to-end tests, no module can reach WORKING.
