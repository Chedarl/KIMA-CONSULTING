# Frontend ↔ Backend Coverage

**Rule:** every screen is a view plus a set of allowed actions over a backend
engine or table. If a process has no backend, it gets no screen. If the backend
has a process, it must have a surface — or an explicit "not yet" in this file.
If a button exists, it calls an engine transition; if the engine would refuse,
the button is disabled with the engine's own reason (`denialLabel()`), never
hidden silently and never faked.

Updated in the same commit as every screen it describes (step 7 of the
seven-step gate). Source of truth: `lib/*.ts` engines, Supabase tables/RLS,
`app/api/*`. Visual target: the MVP 1 handoff boards. Where a board and the
backend disagree, the backend wins; where a board and blueprint §9 disagree,
§9 wins (amber = warning, never CTA; no unsourced statistics; never
"Filed on DGI").

## Backend inventory (verified 2026-10-22)

Engines (`lib/`): `registration` (lifecycle + KPI timestamps + completeness,
advisory never a gate) · `crm` (contacts ⟷ taxpayers, derived segments, typed
tags) · `cases` (one obligation × taxpayer × period; stages
documents→accounting→preparation→review→filing→evidence→delivered, backwards
allowed; four dimensions kept apart: work / filing / tax paid / fee paid;
derived blocker) · `events` (34 kinds, visibility derived from kind, `drift()`)
· `document-review` (three verdicts; unverified rule ⇒ escalate, never decide)
· `document-naming` (folders from obligations, reference grammar) ·
`organizer` (derives documents only, never obligations) · `diagnostics`
(blocking/advisory) · `permissions` (capability matrix mirrored in SQL,
`canApproveReview()`, separation of duties) · `rules` (jurisdiction packs;
14 CM rules, 1 verified; `obligationsFor()`, `resolveDueDate()` reports
statutory vs prorogued and whether a date can be relied on) · `portal-auth`.

Data: `registrations`, `taxpayers`, `engagements`, `compliance_cases`,
`case_tasks`, `case_events`, `document_requests`, `documents`, `declarations`,
`messages`, `invoices`, `service_payments`, `organizer_answers`,
`validation_findings`, `organizations` — plus legacy `activity_events`
(to be folded into `case_events`, see README) and `audit_events`.
RPC: `portal_sign_in` (DEPRECATED). API: `POST /api/inquiry` (Resend).

## Coverage matrix

| Backend process | Firm surface | Client surface | Verdict |
|---|---|---|---|
| Registration lifecycle + 4 intake channels | `LeadsWorkspace` `/workspace/leads` calls `transition()`; completeness is advisory; 24h breach is on the row | `RegistrationForm` `/register` | REFLECTED. Moves require `engagement.create`. No sales pipeline. |
| CRM: segments, links, per-link access | `ClientsWorkspace` and `Client360` `/workspace/clients/[id]` (`linkedFiles`, `unreachable`) | — | REFLECTED |
| Cases: stages, 4 dimensions, blocker, risk | `FirmDashboard`, `WorkQueue`, `CaseDetail` `/workspace/cases/[id]` (`advance`, `recordFiling`, four dimensions) | `ClientDashboard` and `/app/declarations/[id]` use the five `clientStatus()` labels only | REFLECTED. The client never sees firm stage names. |
| Events: timeline, visibility, `drift()` | dashboard feed | dashboard feed (client-visible only) | PARTIAL — no audit/drift surface |
| `activity_events` (legacy) | — | — | Writes revoked in `20261023044730`. The table remains. New events go to `case_events`. |
| Document review: 3 verdicts | `InboxWorkspace` `/workspace/inbox` records `documents.acceptance` before accept | `DocumentsPanel` uploads a file and shows received separately from accepted | REFLECTED. A client upload lands as `submitted`, never `accepted`. |
| Document naming: buckets, references | `FilingFramework` `/workspace/filing` | — | PARTIAL — grammar not applied to document centre / archive |
| Rules: obligations, deadlines, prorogations | `/workspace/calendar` labels statutory, prorogued, and unconfirmed | Client compliance, declarations, archive | REFLECTED |
| Diagnostics (pre-approval gate) | `ReviewsPanel` `/workspace/reviews` | — | REFLECTED — queue is `compliance_cases`; approve calls `commandAdvanceCase` (SoD); filing evidence is one `commandRecordFiling` step |
| Permissions: capabilities, SoD, denial reasons | Firm shell shows the OTP session and `capabilitiesOf()`. Case, inbox, reviews and messages refuse without that member. | portal OTP login | REFLECTED for the firm workspace. Writes still need the Auth session minted by `verifyFirmCode`. |
| Payments / billing dimension | nav `ready:false` | `PaymentsPanel` `/app/payments` | PARTIAL — firm billing missing |
| Messages | `MessagesWorkspace` | `MessageThread` | REFLECTED (realtime) |
| Organizer (documents only) | `OnboardingWizard` | in registration flow | REFLECTED |
| DSF Bridge (`validation_findings`, declarations) | — | — | MISSING — Priority 1 after MVP 1 spine |
| Public site → registration | — | landing `/` | REFLECTED (Phase 1b); feeds `registrations` only |

## Build order (backend-first)

1. **B (done in this change):** kill `demo-data` on `/app/compliance`,
   `/app/declarations`, `/app/archive` — rebuild on `taxpayers`,
   `compliance_cases`, `document_requests`, `case_events` via `lib/cases`
   (`clientStatus`, `obligationLabel`) and `lib/events` (`timeline`).
2. **C:** Client 360° shell + Compliance Case screen (case spine, board 5/8).
3. **D:** Role-aware shells from `lib/permissions`; OTP sign-in surface
   (delivery gap stated, not faked).
4. **E:** Storage upload; naming grammar applied to documents/archive.
5. **F:** F6 triage · deadlines calendar (statutory/prorogued badges) · firm
   billing · F5 error states · F7 KPI view.

## Non-negotiables per screen

FR+EN parity (typed dictionaries) · 375/768/1024/1440 · contrast ≥4.5:1 ·
3px focus rings · ≥44px targets · `prefers-reduced-motion` · SVG icons, never
emoji · status honesty (confirmed / draft / estimated / awaiting review
visually distinct) · nothing shown rather than stale numbers on outage ·
received ≠ accepted, in words · filing only with evidence.
