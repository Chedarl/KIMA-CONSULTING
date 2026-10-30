# D — Ranked backlog

Effort: **S** ≤ 1 day, **M** 2–4 days, **L** ≥ 1 week (one engineer with an agent).
Risk: what goes wrong if this is done badly. Every BUILD item passes the repo's
seven-step gate (README, "How work is built now").

Each item names a **taxpayer outcome** that the test protocol can measure — the brief's
standard is "less painful, more accurate", not more screens.

## P0 — honesty and safety (owner-approved as the first slice)

| # | Item | Label | Depends on | Effort | Risk | Taxpayer outcome |
|---|---|---|---|---|---|---|
| P0-1 | Storage: drop the `anon` policies; add `authenticated` insert/select scoped by `can_see_taxpayer()` on the path's taxpayer segment | ADAPT | — | S | H — getting the path predicate wrong reopens cross-tenant reads | A signed-in client's upload actually lands; nobody else can read it |
| P0-2 | `case_events` client inserts limited to client-legal kinds with `actor_role = 'client'`; messages `sender` forced by role; client updates on `document_requests` limited to `status`; client `documents` inserts limited to `pending`/`taxpayer`/`upload` and a path under their own taxpayer | ADAPT | — | M | H | A client's history cannot say something the firm never did |
| P0-3 | Status copy honesty: `clientStatus()` reads `filing_status` (stage `filing` + `not_submitted` ≠ "Filed"); `abandoned` gets its own client state; pending fee ≠ "Paid"; profile save detects refusals via `lib/db-write.ts`; onboarding "private tenant" wording replaced | ADAPT | — | M | M | **Zero false "filed/paid/complete" on any screen** (protocol metric 4) |
| P0-4 | Fix `delivery_requires_filing_outcome` and `canDeliver()` so a case cannot be delivered unfiled | ADAPT | — | S | M | Archive lists only verified work |
| P0-5 | OTP reveal refused when `VERCEL_ENV=production` and never on send failure; `failed_attempts` not reset on re-issue; portal/firm identity merge refused; verify returns an error, not `ok`, when no session is minted | ADAPT | — | M | H | Taxpayer accounts cannot be taken over with a name and NIU |
| P0-6 | Finish the Edge Function sign-in path: commit `lib/auth-codes.ts` + route changes, write `supabase/functions/auth-codes/index.ts`, deploy steps in `docs/deployment.md` | BUILD | P0-5 | M | H — privileged code; the service key must never leave Supabase | Sign-in works without a service-role key in Vercel |
| P0-7 | Add `case_events`, `compliance_cases`, `case_tasks` to the realtime publication, or remove the "Live" badge where it cannot be true | ADAPT | — | S | L | What the screen says is current, is |
| P0-8 | Test harness: valid fixtures, count real assertions, add negative assertions for P0-3/P0-4 | ADAPT | — | S | L | — (protects every outcome above) |
| P0-9 | `demoIds()` replaced by the request's own `taxpayer_id`/`organization_id` on every write path | ADAPT | — | S | M | Records belong to the right taxpayer |

## P1 — incident recovery (owner-approved second half of the slice: Variant 2 only)

| # | Item | Label | Depends on | Effort | Risk | Taxpayer outcome |
|---|---|---|---|---|---|---|
| P1-1 | Tax-payment states + `recordPayment()` + DB CHECK (`verified` requires evidence) + `eventsFromPayment` | BUILD | P0-2 | M | H — the debit-is-not-paid rule is the core promise | A debit is never shown as paid |
| P1-2 | `lib/incidents.ts` state machine + `incidents`, `incident_evidence`, `incident_contacts` tables, RLS via `can_see_taxpayer()`; `incident` event dimension | BUILD | P0-1, P0-2 | L | H | Everything needed for a support call is in one place, timestamped |
| P1-3 | `nextBestAction()` — pure, one action, bilingual, cites a source or says "unverified"; replaces the hard-coded dashboard string | ADAPT | P1-1, P1-2 | M | H — a wrong instruction is the worst failure (protocol metric 1) | Taxpayer knows the single next step |
| P1-4 | Client screen on `/app/declarations/[caseId]`: five dimensions, next action, "record what happened", evidence upload | BUILD | P1-1–3 | M | M | Taxpayer can answer "what is still unresolved?" (metric 5) |
| P1-5 | Case-file export (JSON + printable HTML), hashed document list, "not an official document / not an ACF" | BUILD | P1-2 | M | M — must not resemble an ACF | Support-ready packet in one tap |
| P1-6 | Firm view of incidents in `case-detail.tsx`; reviewer-only verification | ADAPT | P1-2 | S | M | Professional confirmation without re-keying |
| P1-7 | Escalation guidance content — only from sources verified in E §2 | BUILD (content) | E S-1…S-5, P1-9a | S per item | H | Guidance that is right, or honestly absent |
| P1-8 | Reviewer credential: a `firm_reviewer` can verify only with a recorded expert-comptable registration (number, body, checked-by, checked-on); `canApproveReview()` refuses otherwise | ADAPT | — | S | H — an uncredentialed "reviewer" verifying a filing is the failure the blueprint exists to prevent | Every "verified" names a qualified professional (owner answer 1) |
| P1-9a | **Official-text register**: watch the official publishers (impots.cm, minfi.gov.cm, dgb.cm), store each text with URL, fetch date, `sha256` and the original file; a reviewer marks it `verified` and links it to the rules it supports | BUILD | P0-1 | M | H — a scraped page mistaken for the official text (R-46) | The primary texts S-1…S-5 actually get into the system (owner answer 3) |
| P1-9b | **Plain-language bulletins ("news")**: FR + EN summary of one official text, who it affects (regime, taxpayer type, centre), what changes and from when, link to the original. Draft → expert-comptable review → published; withdrawn when the text changes. Shown in the taxpayer workspace, matched to their declared profile | BUILD | P1-8, P1-9a | M | H — a wrong summary (R-45) | Taxpayer learns of a change in words they understand, with the source one tap away |
| P1-9c | Machine-drafted summaries for the reviewer (never shown to taxpayers unapproved; the diff against the source is shown to the reviewer) | BUILD | P1-9b | M | H | Reviewer time per bulletin goes down; accuracy does not |

## P2 — after the slice

| # | Item | Label | Depends on |
|---|---|---|---|
| P2-1 | Certificate (ACF) dimension + Variant 3 journey | BUILD | Source S-4 |
| P2-2 | Variant 1 (portal error before deadline) as incident type with deadline-risk warning | ADAPT | P1-2, a verified IGS deadline |
| P2-3 | Link `filing_evidence_ref` to `documents.id`; compute `sha256` on upload | ADAPT | P0-1 |
| P2-4 | Assisted / WhatsApp / paper intake of incident evidence (`arrived_via`, captured-by provenance) | ADAPT | P1-2 |
| P2-5 | Organisation scoping in `member_has()` — **BLOCKING: must merge before any second firm is onboarded** (owner decision D7, 27 Oct; risk R-47). **Written, awaiting merge: PR #22, migration `20261029213000`.** The hole was worse than described here: `can_see_taxpayer()` never received the taxpayer at all, and `current_firm_role()` had no organisation filter, so the gap covered reads *and* ~40 write policies. The fix adds `member_has(cap, taxpayer_id)` (requires a live engagement) and `member_has_in_org(cap, organization_id)` for rows a firm owns, with 31 two-firm pgTAP checks in `supabase/tests/two_firm_isolation_test.sql` covering taxpayers, cases, requests, documents, stored files, invoices, case tasks and the application queue, both directions, reads and writes. Three decisions were settled in review and are recorded in the migration header: a live engagement is **accepted or authorized** and unrevoked, so a draft grants nothing (the firm still reads its own draft through `member_has_in_org`); `engagements.status` gained a CHECK naming the six states the target design uses, because a value-matching access rule on free text fails silently; and a **public application with no organisation** stays readable by firm members who work client files, with the update that answers it being the same update that claims it into their own firm. `kima_admin` is excluded from that queue by name, which left the wider rule-7 question open as risk R-48. Original description follows. Not built now. Today `member_has(cap)` asks only "does the caller's role hold this capability?", never "in which organisation?", so a partner of firm X would pass every firm policy on firm Y's rows: `can_see_taxpayer()` (`member_has('case.view')`), invoices and `service_payments` read, insert and confirm (`billing.view`, `payment.record`, `billing.manage`), `taxpayers` update, `case_tasks`, `validation_findings`. The fix is a per-organisation check (`member_has(cap, org)` or `can_see_taxpayer()` resolving the taxpayer's organisation), every policy rewritten to pass the row's `organization_id`, and SQL negative tests with two firms. Until it lands the firm sign-up option stays hidden (`OPEN_WORKSPACE_KINDS`, done 27 Oct) and no second `organizations` row may hold members. Owner: Agent A | ADAPT | — (blocks multi-firm work) |
| P2-6 | Quarter-keyed periods so quarter-specific prorogations match | ADAPT | — |
| PH1-1 | **WRITTEN, AWAITING MERGE (migration `20261030020000`).** Take the `SECURITY DEFINER` helpers off the API. The plan offered two remedies and only one works: **moving** them out of the exposed schema. Eleven move to a `private` schema PostgREST does not publish (`auth_identity_is_single`, `can_see_taxpayer`, `client_taxpayer_ids`, `current_firm_role`, `current_member_label`, `demo_taxpayer_id`, `firm_member_has`, `flag_enabled`, `member_has` ×2, `member_has_in_org`, `portal_request_code`); the move preserves each OID so the policy expressions keep working. **Revoking `EXECUTE` is not an option** — Postgres checks it against the querying role inside a policy expression, so the first revision of this migration broke `insert into documents` with `permission denied for function client_taxpayer_ids` and took six P0 write tests with it. That also means the three `revoke execute … from anon, authenticated` lines in `20261029213000` are no-ops (PUBLIC still held the inherited grant) and read as a control they are not; this migration replaces them with explicit grants. `portal_request_code` additionally loses its grants, since nothing calls it (R-49). `supabase/tests/definer_surface_test.sql` asserts the catalog facts (T-51 … T-53, including "exactly one definer function in `public` is callable by anon or authenticated") and the three live call paths (T-54 … T-60). One exposure kept and justified in writing: `can_write_client_note(taxpayer_id)`, for `authenticated` only, because `/api/inquiry` must know before it sends mail. `/api/inquiry` no longer calls `member_has()` or `can_see_taxpayer()` over RPC; its visibility check is a scoped read of `taxpayers` under the caller's own session. Owner: Agent A | ADAPT | Plan phase 1 |
| PH1-4 | **WRITTEN, AWAITING MERGE (migration `20261030020000`).** `app_flags` has RLS on with no policy (advisor lint 0008). Documented as deliberate rather than fixed: nothing reads the table through the API, `flag_enabled()` reads it as its owner, and `anon`/`authenticated` hold no grant on it either. A permissive policy would publish the demo switches to the browser. The reason now lives in a `comment on table`. Owner: Agent A | ADAPT | Plan phase 1 |

## P3 — validation and reach

Comprehension tests with real participants (protocol §4), bilingual and 375 px / slow
network checks of the incident screens, notification preferences, cost-of-compliance
instrumentation (time from incident to resolution).

## DEFER (from the brief, confirmed)

Automated DGI filing or payment · refund or penalty-relief promises · speculative tax
optimisation · CEMAC expansion · AI tax advice without a verified corpus · any IGS
obligation activation before source S-1 is `verified`.
