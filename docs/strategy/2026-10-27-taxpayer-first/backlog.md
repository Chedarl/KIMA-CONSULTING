# D — Ranked backlog

Effort: **S** ≤ 1 day, **M** 2–4 days, **L** ≥ 1 week (one engineer with an agent).
Risk: what goes wrong if this is done badly. Every BUILD item passes the repo's
seven-step gate (README, "How work is built now").

Each item names a **taxpayer outcome** that the test protocol can measure — the brief's
standard is "less painful, more accurate", not more screens.

**Statuses and phases (added 29 Oct 2026).** The `Status` column is verified against `main`
@ `5df9ffd`. The `Plan phase` column maps each item to its phase in
`docs/strategy/2026-10-29-qa-and-adoption/plan.md`, which is the controlling roadmap. This
file stays the single place where per-item status lives — there is no competing roadmap.
Plan tasks that had no backlog ID were given `PH*` IDs in the section
"Phase tasks with no earlier backlog ID" below.

## P0 — honesty and safety (owner-approved as the first slice)

| # | Item | Label | Depends on | Effort | Risk | Taxpayer outcome | Status (29 Oct 2026) | Plan phase |
|---|---|---|---|---|---|---|---|---|
| P0-1 | Storage: drop the `anon` policies; add `authenticated` insert/select scoped by `can_see_taxpayer()` on the path's taxpayer segment | ADAPT | — | S | H — getting the path predicate wrong reopens cross-tenant reads | A signed-in client's upload actually lands; nobody else can read it | **DONE** — `20261027120000`. Policies are in place but **no object has ever been written**; the loop is unverified | 5 verifies |
| P0-2 | `case_events` client inserts limited to client-legal kinds with `actor_role = 'client'`; messages `sender` forced by role; client updates on `document_requests` limited to `status`; client `documents` inserts limited to `pending`/`taxpayer`/`upload` and a path under their own taxpayer | ADAPT | — | M | H | A client's history cannot say something the firm never did | **DONE** — `20261027120000` (`client_may_record()` = `CLIENT_EVENT_KINDS`) | done |
| P0-3 | Status copy honesty: `clientStatus()` reads `filing_status` (stage `filing` + `not_submitted` ≠ "Filed"); `abandoned` gets its own client state; pending fee ≠ "Paid"; profile save detects refusals via `lib/db-write.ts`; onboarding "private tenant" wording replaced | ADAPT | — | M | M | **Zero false "filed/paid/complete" on any screen** (protocol metric 4) | **DONE** — `clientStatus()`, `clientStep()`, `feePaymentState()` | done |
| P0-4 | Fix `delivery_requires_filing_outcome` and `canDeliver()` so a case cannot be delivered unfiled | ADAPT | — | S | M | Archive lists only verified work | **DONE** — delivery refused without a verified filing | done |
| P0-5 | OTP reveal refused when `VERCEL_ENV=production` and never on send failure; `failed_attempts` not reset on re-issue; portal/firm identity merge refused; verify returns an error, not `ok`, when no session is minted | ADAPT | — | M | H | Taxpayer accounts cannot be taken over with a name and NIU | **DONE** — OTP reveal, failure count, identity merge, verify-without-session | done |
| P0-6 | Finish the Edge Function sign-in path: commit `lib/auth-codes.ts` + route changes, write `supabase/functions/auth-codes/index.ts`, deploy steps in `docs/deployment.md` | BUILD | P0-5 | M | H — privileged code; the service key must never leave Supabase | Sign-in works without a service-role key in Vercel | **DONE** — `supabase/functions/auth-codes/index.ts`, deployed v5; history in `docs/deployment.md` | done |
| P0-7 | Add `case_events`, `compliance_cases`, `case_tasks` to the realtime publication, or remove the "Live" badge where it cannot be true | ADAPT | — | S | L | What the screen says is current, is | **DONE** — `20261027120000` L305–307 adds the tables to `supabase_realtime` | done |
| P0-8 | Test harness: valid fixtures, count real assertions, add negative assertions for P0-3/P0-4 | ADAPT | — | S | L | — (protects every outcome above) | **DONE** — 4 pgTAP suites: `p0_auth`, `p0_storage`, `p0_writes`, `fee_payments` (24 checks) | done |
| P0-9 | `demoIds()` replaced by the request's own `taxpayer_id`/`organization_id` on every write path | ADAPT | — | S | M | Records belong to the right taxpayer | **PARTIAL** — `sessionTaxpayerId()` added and client writes use it, but `demoIds()` survives in `lib/supabase.ts:92` and still falls back to the **oldest** taxpayer/organisation (`:135`). Same defect as plan issue 8 | 1 |

## P1 — incident recovery (owner-approved second half of the slice: Variant 2 only)

| # | Item | Label | Depends on | Effort | Risk | Taxpayer outcome | Status (29 Oct 2026) | Plan phase |
|---|---|---|---|---|---|---|---|---|
| P1-1 | Tax-payment states + `recordPayment()` + DB CHECK (`verified` requires evidence) + `eventsFromPayment` | BUILD | P0-2 | M | H — the debit-is-not-paid rule is the core promise | A debit is never shown as paid | **PARTIAL** — the state graph is in `lib/incidents.ts` (`debit_observed` has no edge to `verified`, `:195`), merged #19. **No table, no DB CHECK, no `recordPayment()`** | 6 |
| P1-2 | `lib/incidents.ts` state machine + `incidents`, `incident_evidence`, `incident_contacts` tables, RLS via `can_see_taxpayer()`; `incident` event dimension | BUILD | P0-1, P0-2 | L | H | Everything needed for a support call is in one place, timestamped | **APPROVED, NOT BUILT** — owner decision D3 on Agent A's reconciled contract; Agent B's reply note landed in #19, so it is unblocked | 6 |
| P1-3 | `nextBestAction()` — pure, one action, bilingual, cites a source or says "unverified"; replaces the hard-coded dashboard string | ADAPT | P1-1, P1-2 | M | H — a wrong instruction is the worst failure (protocol metric 1) | Taxpayer knows the single next step | **PARTIAL** — `nextBestAction()` exists (`lib/next-best-action.ts:344`), wired only to the mock prototype | 6 |
| P1-4 | Client screen on `/app/declarations/[caseId]`: five dimensions, next action, "record what happened", evidence upload | BUILD | P1-1–3 | M | M | Taxpayer can answer "what is still unresolved?" (metric 5) | **NOT BUILT** | 6 |
| P1-5 | Case-file export (JSON + printable HTML), hashed document list, "not an official document / not an ACF" | BUILD | P1-2 | M | M — must not resemble an ACF | Support-ready packet in one tap | **NOT BUILT** | 6 |
| P1-6 | Firm view of incidents in `case-detail.tsx`; reviewer-only verification | ADAPT | P1-2 | S | M | Professional confirmation without re-keying | **NOT BUILT** | 6 |
| P1-7 | Escalation guidance content — only from sources verified in E §2 | BUILD (content) | E S-1…S-5, P1-9a | S per item | H | Guidance that is right, or honestly absent | **NOT BUILT** — blocked on sources S-1…S-5 (1 of 14 rules verified) | 7 |
| P1-8 | Reviewer credential: a `firm_reviewer` can verify only with a recorded expert-comptable registration (number, body, checked-by, checked-on); `canApproveReview()` refuses otherwise | ADAPT | — | S | H — an uncredentialed "reviewer" verifying a filing is the failure the blueprint exists to prevent | Every "verified" names a qualified professional (owner answer 1) | **NOT BUILT** — lands in the same migration as the P1-2 payment `verified` CHECK (D3) | 6 |
| P1-9a | **Official-text register**: watch the official publishers (impots.cm, minfi.gov.cm, dgb.cm), store each text with URL, fetch date, `sha256` and the original file; a reviewer marks it `verified` and links it to the rules it supports | BUILD | P0-1 | M | H — a scraped page mistaken for the official text (R-46) | The primary texts S-1…S-5 actually get into the system (owner answer 3) | **NOT BUILT** | 6 |
| P1-9b | **Plain-language bulletins ("news")**: FR + EN summary of one official text, who it affects (regime, taxpayer type, centre), what changes and from when, link to the original. Draft → expert-comptable review → published; withdrawn when the text changes. Shown in the taxpayer workspace, matched to their declared profile | BUILD | P1-8, P1-9a | M | H — a wrong summary (R-45) | Taxpayer learns of a change in words they understand, with the source one tap away | **NOT BUILT** | 6 |
| P1-9c | Machine-drafted summaries for the reviewer (never shown to taxpayers unapproved; the diff against the source is shown to the reviewer) | BUILD | P1-9b | M | H | Reviewer time per bulletin goes down; accuracy does not | **NOT BUILT** | 6 |

## P2 — after the slice

| # | Item | Label | Depends on | Status (29 Oct 2026) | Plan phase |
|---|---|---|---|---|---|
| P2-1 | Certificate (ACF) dimension + Variant 3 journey | BUILD | Source S-4 | **NOT BUILT** | after 7 |
| P2-2 | Variant 1 (portal error before deadline) as incident type with deadline-risk warning | ADAPT | P1-2, a verified IGS deadline | **NOT BUILT** | 6 |
| P2-3 | Link `filing_evidence_ref` to `documents.id`; compute `sha256` on upload | ADAPT | P0-1 | **NOT BUILT** | 5 |
| P2-4 | Assisted / WhatsApp / paper intake of incident evidence (`arrived_via`, captured-by provenance) | ADAPT | P1-2 | **NOT BUILT** | after 7 |
| P2-5 | Organisation scoping in `member_has()` — **BLOCKING: must merge before any second firm is onboarded** (owner decision D7, 27 Oct; risk R-47). Not built now. Today `member_has(cap)` asks only "does the caller's role hold this capability?", never "in which organisation?", so a partner of firm X would pass every firm policy on firm Y's rows: `can_see_taxpayer()` (`member_has('case.view')`), invoices and `service_payments` read, insert and confirm (`billing.view`, `payment.record`, `billing.manage`), `taxpayers` update, `case_tasks`, `validation_findings`. The fix is a per-organisation check (`member_has(cap, org)` or `can_see_taxpayer()` resolving the taxpayer's organisation), every policy rewritten to pass the row's `organization_id`, and SQL negative tests with two firms. Until it lands the firm sign-up option stays hidden (`OPEN_WORKSPACE_KINDS`, done 27 Oct) and no second `organizations` row may hold members. Owner: Agent A | ADAPT | — (blocks multi-firm work) | **NOT BUILT — LAUNCH BLOCKER.** Raised from P2: it is plan issue 1 and a phase 1 exit condition. Nothing multi-firm may ship before it | **1** |
| P2-6 | Quarter-keyed periods so quarter-specific prorogations match | ADAPT | — | **NOT BUILT** | after 7 |

## Phase tasks with no earlier backlog ID (29 Oct 2026)

From `docs/strategy/2026-10-29-qa-and-adoption/plan.md`. Every task in that plan now has an
ID here or above. Phases run 0 → 1 → … → 7; track B runs in parallel after phase 1.

| # | Item | Label | Phase | Status | Risk |
|---|---|---|---|---|---|
| PH0-1 | Correct README "Where the work stands": P0 fixes merged and applied, not a draft PR | ADAPT | 0 | **DONE** (this change) | L |
| PH0-2 | Refresh `docs/foundation/frontend-backend-coverage.md`: storage, incidents and fee rows | ADAPT | 0 | **DONE** (this change) | L |
| PH0-3 | Map every phase task to a backlog ID and record statuses | ADAPT | 0 | **DONE** (this change) | L |
| PH0-4 | Draft the `CLAUDE.md` / blueprint wording for the multi-tenant model and **hold** it until the owner decides | BUILD (doc) | 0 | **DRAFTED AND HELD** — `docs/strategy/2026-10-29-qa-and-adoption/multi-tenant-wording-proposal.md`. Not applied | M — applying it early would freeze an unapproved requirement |
| PH0-5 | Synthetic seed: 2 firms, 2 taxpayers, files, messages. Synthetic data only | BUILD | 0 | **DONE** (this change) — `supabase/seed/synthetic.sql`, never run against production | M — must never carry real taxpayer data |
| PH0-6 | Home "How it works" step 01 offers an accounting firm while firm sign-up is hidden | ADAPT | 0 | **DONE** (this change) — honesty defect in Agent B's path, announced in a handoff | L |
| PH1-1 | Revoke `EXECUTE` from `anon`/`authenticated` on the 8 `SECURITY DEFINER` helpers, or move them out of `public`; justify in writing every call RLS still needs | ADAPT | **1** | **NOT BUILT — LAUNCH BLOCKER** | H — plan issue 2 |
| PH1-2 | Confirm a revoked engagement (`revoked_at`) removes access in every policy and helper | ADAPT | **1** | **NOT VERIFIED** — `revokeEngagement` sets the timestamp; helper behaviour unchecked (plan issue 7) | H |
| PH1-3 | Add policies to `app_flags`, or document why it has none (RLS on, no policy) | ADAPT | **1** | **NOT BUILT** | M |
| PH1-4 | Set `app_flags.allow_demo_anon` and `demo_otp_reveal` to `false` in any environment holding real data (R-32/R-36) | ADAPT | **1** | **NOT DONE** — both `true` as of 29 Oct. **Blocks real data** | H |
| PH1-5 | Set `SUPABASE_SERVICE_ROLE_KEY` in the Vercel dashboard (never in the repo); then drop the `auth-codes` fallback where it is no longer needed | ADAPT | **1** | **UNVERIFIED** (plan issue 4) | H — the key must never enter the repo |
| PH1-6 | Enable leaked-password protection in Supabase Auth | ADAPT | **1** | **NOT DONE** | L |
| PH1-7 | pgTAP + route suite for two firms: Firm A reads none of Firm B's clients, documents, invoices, tasks or storage objects | BUILD | **1** | **NOT BUILT — LAUNCH BLOCKER**; the phase 1 exit condition | H |
| PH2-1 | Firm self-sign-up: create the organisation and owner membership; unhide via `OPEN_WORKSPACE_KINDS` **only after phase 1** | BUILD | **2** | **NOT BUILT — LAUNCH BLOCKER** (plan issue 5) | H — unhiding early exposes every firm's clients |
| PH2-2 | Team settings: invite, revoke and assign staff roles (owner, accountant, reviewer), with an audit event per sensitive change | BUILD | **2** | **NOT BUILT** | H |
| PH2-3 | Onboarding approval in one transaction: `registrations` → `taxpayers` + `contacts` + draft `engagements` + `portal_accounts`, in the approver's organisation | BUILD | **2** | **NOT BUILT** — a registered taxpayer still cannot sign in (plan issue 9) | H |
| PH3-1 | Invitations both directions on `workspace_invites`, lifecycle Invited → Accepted → Active → Revoked/Expired, expiry enforced server-side | BUILD | 3 | **NOT BUILT** — 0 rows (plan issue 6) | H |
| PH3-2 | Access audit: who granted access, what was accessed, when it ended; immutable events | BUILD | 3 | **NOT BUILT** | H |
| PH3-3 | Revocation effective immediately; short-TTL signed URLs | BUILD | 3 | **NOT BUILT** | H |
| PH3-4 | Client service request writes a draft engagement in the client's **own** organisation instead of a message, and stops using the oldest organisation (`components/client-portal/services-board.tsx` L152–188, L165) | ADAPT | 3 | **NOT BUILT** (plan issue 8; same root cause as P0-9) | H |
| PH4-1 | Create a case, assign a task and request documents from the UI, with no hand edits to the database | BUILD | 4 | **NOT BUILT** (plan issue 10) | M |
| PH4-2 | Screens: firm dashboard, Client 360, workflow board, compliance board, team settings | BUILD | 4 | **PARTIAL** — 7 of 10 planned firm screens missing (plan issue 13) | M |
| PH4-3 | Add the client-approval and cancelled stages to `lib/cases.ts` and the transitions in `advance()` | ADAPT | 4 | **NOT BUILT** (plan issue 19) | M |
| PH4-4 | Role-based views with permission-denied states; an accountant sees only assigned cases | BUILD | 4 | **NOT BUILT** | M |
| PH4-5 | Work-queue redesign (paused since 23 Oct) | ADAPT | 4 | **PAUSED** (plan issue 22) | L |
| PH5-1 | Short-lived signed URLs issued only after an authorisation check; non-guessable object keys | BUILD | 5 | **NOT BUILT** (plan issue 12) | H |
| PH5-2 | File-type validation by content, not extension, plus a size limit | BUILD | 5 | **NOT BUILT** | H |
| PH5-3 | Document versions; return with a reason; `returned_count` incremented | BUILD | 5 | **NOT BUILT** | M |
| PH5-4 | Signed-out states on portal pages, which today show only a heading | ADAPT | 5 | **NOT BUILT** (plan issue 21) | L |
| PH6-1 | Idempotency keys on every incident, filing and payment write | BUILD | 6 | **NOT BUILT** (plan issue 18) | M — retries would duplicate records |
| PH6-2 | Only a reviewer may set `officially_verified`, and only on the server | ADAPT | 6 | **NOT BUILT** | H |
| PH7-1 | End-to-end suite for the whole priority journey | BUILD | **7** | **NOT BUILT** — no route or E2E tests exist (plan issue 14) | H |
| PH7-2 | Independent security review; zero unresolved critical or high findings | — | **7** | **NOT DONE — LAUNCH BLOCKER** | H |
| PH7-3 | Low-bandwidth and mobile testing | — | **7** | **NOT DONE** | M |
| PH7-4 | Privacy and legal review | — | **7** | **NOT DONE** | H |
| PH7-5 | Comprehension test with 5–10 taxpayers | — | **7** | **NOT DONE** — participants available (owner answer) | M |
| PH7-6 | Pilot with 5 firms in Douala and Yaoundé; settle retention and pricing | — | **7** | **NOT DONE** | M |
| PH7-7 | A verified source and effective date for every active obligation | BUILD (content) | **7** | **1 of 14 rules verified** (plan issue 15) | H — plan rule 8 |
| PHB-1 | Replace the design tokens with the plan §4.5 palette; add the `success` token `#15803D` | ADAPT | B | **NOT BUILT** (plan issue 26, owner-decided) | L |
| PHB-2 | Update components and status badges (word + icon, never colour alone) and the transactional email templates | ADAPT | B | **NOT BUILT** | L |
| PHB-3 | Update README §9 and blueprint §9; leave `public/brand/` artwork unchanged | ADAPT | B | **NOT BUILT** | L |

## P3 — validation and reach

Comprehension tests with real participants (protocol §4), bilingual and 375 px / slow
network checks of the incident screens, notification preferences, cost-of-compliance
instrumentation (time from incident to resolution).

## DEFER (from the brief, confirmed)

Automated DGI filing or payment · refund or penalty-relief promises · speculative tax
optimisation · CEMAC expansion · AI tax advice without a verified corpus · any IGS
obligation activation before source S-1 is `verified`.
