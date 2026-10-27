# B — Current vs target gap matrix

Audited at `main` @ `62405fa`, read-only. Line numbers are at that commit. "Verdict" uses
the brief's labels: **KEEP** (already solves it), **ADAPT** (extend what exists), **BUILD**
(new), **DEFER** (not this iteration).

Where the README and the code disagree, the code and migrations win; the README
contradictions are listed in §4 and corrected in the same pull request.

## 1. The brief's concepts against the code

| # | Brief concept | What exists | Gap | Verdict | Where to extend |
|---|---|---|---|---|---|
| 1 | KIMA work stage | `CaseStage` (`lib/cases.ts:50`), `STAGE_FLOW` (`:271`), `advance()` gates (`:439-479`) | — | **KEEP** | — |
| 2 | Filing acknowledgment | `FilingStatus` incl. `attempted` for "the DGI went down" (`lib/cases.ts:61-72`); `recordFiling()` refuses `verified` without evidence (`:625-650`); DB CHECK `filing_verified_requires_evidence` (`20261022125435_four_status_dimensions.sql:70-74`) | Evidence is a free-text string — the UI copies the same text into reference and evidence (`components/live/reviews-panel.tsx:335-345`); not linked to a `documents` row | **ADAPT** | Link `filing_evidence_ref` to `documents.id` |
| 3 | Tax payment | `PaymentEvidenceStatus` enum only (`lib/cases.ts:76`); event kinds `payment_*` exist but nothing emits them | **No engine, no DB CHECK, no UI.** Any RLS-permitted write can set `verified`. No "debit observed / reference / DGI receipt / disputed" distinction | **BUILD** | `PAYMENT_FLOW` + `recordPayment()` beside `recordFiling`; `eventsFromPayment`; SQL CHECK |
| 4 | Firm fee | `BillingStatus` (`lib/cases.ts:84`); `invoices`, `service_payments` with `confirmed_requires_evidence` | Client screen shows **pending as Paid** (see P0-3) | **ADAPT** | `components/live/payments-panel.tsx:292` |
| 5 | Certificate (ACF) | Nothing. Only ACF mention: `harmony2-dgi-platform-research.md:14` | Dimension absent everywhere; no research | **BUILD** (after research) | `CertificateStatus` beside the four; SQL enum |
| 6 | Incident / recovery case file | Nothing: no table, no event kind, no risk entry | Whole concept | **BUILD** | `lib/incidents.ts` on the `registration.ts` state-machine pattern (`TRANSITIONS` `:118`, `transition` `:156`); an `incident` `EventDimension` (`lib/events.ts:55`) |
| 7 | One next best action | Building blocks: `clientStatus()` (`lib/cases.ts:353`), `deriveBlocker()` (`:937`), `effectiveBlocker()` (`:984`), `risk()` (`:814`) | The dashboard's "next action" is **hard-coded demo copy** (`lib/i18n.ts:91-95`, `:318-322`) | **ADAPT** | `nextBestAction()` in `lib/cases.ts` |
| 8 | Evidence integrity | `documents.sha256` column (`20261021031500_kima_core_schema.sql:71-83`); event provenance (`actor_role`, `actor_label`, `visibility`, `occurred_at`) | `sha256` never computed (`lib/submit-request.ts:34-44`); no assertion-vs-official field | **ADAPT** | Hash on upload; `source` + `basis: declared | official` on evidence |
| 9 | Evidence bundle export | Capabilities `dossier.export` / `dossier.download` (`lib/permissions.ts:65`, `:138`) | No implementation | **BUILD** | Pure builder from `clientTimeline()` (`lib/events.ts:794`) + case row + hashed documents |
| 10 | Taxpayer starts alone | Public registration (`/register`, `lib/public-onboarding.ts`) writes no `organization_id` | Every case requires an engagement — `authorityCheck()` returns `no_engagement` (`lib/cases.ts:868-886`); clients cannot record anything but uploads/notes (`lib/permissions.ts:148`) | **ADAPT** (within the blueprint — `thesis.md` §3) | Client capabilities to *declare* incidents and payments, never to verify |
| 11 | Verified obligations only | `isActive()` derived from provenance; `obligationsFor()` drops inactive (`lib/rules.ts:665-690`) | `packCoverage("CM")`: 14 rules, 1 verified. **IGS taxpayer → zero active obligations** | **KEEP** the mechanism; research the sources | `cameroon-rule-corpus-research.md` |
| 12 | Deadline honesty | `Prorogation` with communiqué reference; `needsConfirmation` (`lib/rules.ts:745-846`) | No prorogation data loaded; quarter periods keyed `"YYYY"` so a quarter-specific prorogation cannot match (`:852-854`) | **ADAPT** | Period key per quarter |
| 13 | Official process navigation | Harmony 2 portal map, `verified`/`inferred` per portal (`lib/rules.ts:897-940`) | No payment-route guidance; Trésor Pay absent from the repo | **BUILD** (after research) | Portal map + guidance strings with source |

## 2. Trace: one taxpayer action, portal → database → firm screen

The brief's Gate 2 asked for one traced action. Chosen: a client uploads a requested
document from the dashboard.

| Step | Code | What actually happens |
|---|---|---|
| 1. Click "Déposer le document" | `components/live/client-dashboard.tsx:316-324`, `send()` `:185-201` | Calls `submitRequestFile` |
| 2. File to storage | `lib/submit-request.ts:27-32` → bucket `kima-demo` | **Signed-in client: refused.** The only storage policies are `to anon` (`20261021031616_realtime_and_storage.sql:22-25`). Anonymous: succeeds |
| 3. `documents` row | `lib/submit-request.ts:34-44` | Requires `client_taxpayer_ids()` → anonymous insert refused. Net: **no path writes both the file and the row** |
| 4. Request → `submitted` | `lib/db-write.ts:37-50` | Works for a signed-in client; zero-row refusals detected |
| 5. `case_events` | `lib/record-event.ts` | `document_uploaded`, actor `client`, visibility `client`; result not checked |
| 6. `audit_events` | `lib/supabase.ts:132-154` | Policy requires a firm capability; **client insert refused, error swallowed** — client actions are never audited |
| 7. Firm sees it | `intake-panel.tsx:64-92`, `inbox-workspace.tsx:163-175` | Via realtime on `documents` — which never got a row (step 3). Firm cannot preview files either: no `authenticated` storage SELECT |

**Conclusion:** the README's verified demo ("clicking Send this document moved the
request…") predates the auth close-out. Under the current schema, document upload does
not work end to end for any real session. This is P0-1.

## 3. P0 defects — honesty and safety (verified in SQL / code)

These come before any new feature, because the incident slice depends on uploads,
events and status copy being trustworthy.

| ID | Defect | Evidence | Consequence |
|---|---|---|---|
| P0-1 | Storage open to anonymous, closed to signed-in users | `20261021031616_realtime_and_storage.sql:22-25` | Anyone can list/read/write every demo file; real users cannot upload or preview |
| P0-2 | Clients can write any `case_events` kind and actor | `…auth_closeout_3_case_events_taxpayer_scope_and_audit.sql:32-54` (client branch has no kind/actor constraint) | A client can forge `filing_verified` in their own history; `drift()` would flag it, but the record is polluted |
| P0-2b | Messages accept `sender='firm'` from clients; clients can write any column of their `document_requests` and arbitrary `documents` fields (`review_status`, `uploaded_by`, `storage_path`) | `…auth_closeout_2b_capability_scoped_writes.sql:4-46` | Spoofed firm messages; self-accepted documents |
| P0-3 | False completion on screen | `clientStatus()` maps stage `filing` → "Filed — awaiting proof" regardless of `filing_status`, and `abandoned` → "Complete" (`lib/cases.ts:353-372`); `payments-panel.tsx:292` counts **pending** as settled → green "Paid"; `profile-board.tsx:97-117` shows "Saved" on silently refused writes; onboarding promises a provisioned "private tenant" (`lib/i18n-public.ts:383-384, 458-461`) that `20261023180000_public_onboarding_workspace_claims.sql:30-31` says is not one | The exact "false completion" the brief's test protocol scores at zero tolerance |
| P0-4 | `delivery_requires_filing_outcome` lets a never-filed case be delivered when `payment_evidence_status = 'not_applicable'`, and on `correction_required` | `20261022125435_four_status_dimensions.sql:83-87`; mirrored in `canDeliver()` `lib/cases.ts:660-665` | Archive could list unfiled work |
| P0-5 | Sign-in hardening | `KIMA_DEMO_OTP_REVEAL` honoured in any environment and also on mail-send failure (`lib/auth-mail.ts:24-28, 65-68`); `*_verify_code` anon-callable and `failed_attempts` reset on every re-issue; portal and firm identities merge on a shared email (`lib/supabase-admin.ts:33-65`); portal verify returns `ok` with no session on mint failure | If the reveal flag reaches production, anyone with a name + NIU signs in as that taxpayer |
| P0-6 | Realtime subscriptions to tables not in the publication | `case_events`, `compliance_cases`, `case_tasks` absent from `supabase_realtime` (`20261021031616_realtime_and_storage.sql:4-8` and later) | "Live" badge shows while updates never arrive |
| P0-7 | Test harness passes vacuously | `scripts/engine-check.mjs:85,92` use `type: "sarl"` (not a `TaxpayerType`) so obligation checks run on `[]`; `:143` `billing_status: "not_quoted"` (not in the enum); count printed is blocks, not assertions | Green CI that proves little |
| P0-8 | Unfinished sign-in work outside the repo | Second local checkout has `lib/auth-codes.ts` + four route changes calling a Supabase Edge Function `auth-codes` that exists nowhere | Owner decision: finish in P0 |
| P0-9 | `demoIds()` always picks the **oldest organisation** and falls back to the oldest taxpayer for writes | `lib/supabase.ts:92-129`, used by dashboard, payments, services, intake | Records tagged to the wrong tenant once there are two |

Noted, not P0 for this slice: `member_has()` has no organisation filter
(`20261022180415_auth_identities_and_structural_permissions.sql:80-86`) — any active firm member sees every
taxpayer. Harmless with one demo firm; **blocking before a second firm exists**, which
public onboarding already offers (`workspace_kind = 'accounting_firm'`).

## 4. Documentation that contradicts the code (corrected in this PR)

| Claim | Where | Truth |
|---|---|---|
| "The SQL lives in Supabase, not in this repo"; "Migration export is partial … twelve in the repo" | `README.md:42`, `:279-283`, `:533` | 41 migration files are in `supabase/migrations/`, applied by CI |
| Demo switch is the GUC `app.allow_demo_anon` | `README.md:382`, `:555`, `lib/supabase.ts:10` | It is the `app_flags` row, seeded `false` (`20261023011145_demo_anon_switch_lives_in_a_table_not_a_guc.sql:28-34`) |
| Client `/app/compliance|declarations|archive` use demo data and are `ready: false` | `README.md:541-542` | Live; the client nav has no `ready` flags (`components/client-portal/shell.tsx:102-111`) |
| `/login` is "name plus taxpayer number" | `README.md:97` | Name + identifier, then an 8-digit one-time code |
| "Verified in the browser … Send this document" | `README.md:425-429` | Pre-dates the auth close-out; see §2 |
| "14 rules, 1 verified … Only the patente renewal date is actionable" | `README.md:83-85` | True of `packCoverage`, which counts regimes, centres and obligations only; the verified VAT rate and cash-threshold sources are outside the count |
| `supabase/README.md` lists six applied migrations | `supabase/README.md:8-17` | Stale — out of scope for this PR, noted |

## 5. Routes

Client nav has no disabled items; every `/app/*` route reads live data. Firm nav marks
`engagements, declarations, vault, billing, reports, admin` as `ready: false`
(`app/[locale]/workspace/layout.tsx:59-71`) and none of those routes exist. There is no
`middleware.ts`; Postgres RLS is the only gate. No route serves tax-payment, incident or
certificate data — all three are new surfaces.
