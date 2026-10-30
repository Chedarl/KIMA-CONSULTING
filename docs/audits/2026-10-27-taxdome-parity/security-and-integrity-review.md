# Security and integrity review

*Agent A (Claude Code). Revision audited: `main` @ `26d1ac7076721ad8d4eb2ae2ec64f98ce6473bb9`
(27 Oct 2026). Database: production project `vhrnrbnjhmxrygvyfirf`, **read-only** queries
only (policies, function bodies, grants, constraints, migration history, row counts).
Nothing was written, deployed or merged.*

## 1. Reassessment of the 27 October findings

Status: **Unresolved** · **Partially resolved** · **Resolved** · **Not independently verified**.
"Verified live" = confirmed against the production database today.

> **Status column dated.** It was written on 27 Oct, before the P0 security
> migration `20261027120000` and the fee-payment migrations merged. Row 4 was
> re-verified against `main` and the live database on 30 Oct and is updated
> below. **The other rows have not been re-verified since 27 Oct**, so an
> "Unresolved" in them means "unresolved as of 27 Oct", not today. Re-verifying
> them is phase 1 work that is not done yet.

| # | Finding (27 Oct) | Status on `main` | Evidence |
|---|---|---|---|
| 1 | Storage permissions | **Unresolved** | The only policies on `storage.objects` are `demo_upload` and `demo_read_objects`, both `to anon`, bucket check only. Any visitor can list, read and upload every file. Signed-in clients and firm members have no policy, so **upload and preview fail for every real session**. Verified live |
| 2 | Unauthorised case-event creation | **Unresolved** | The `case_events` insert policy lets a client write any `kind` (`filing_verified`, `payment_verified`, `fee_paid`…) under any `actor_role`, including a firm role. A firm member can write rows as `actor_role = client`. Verified live |
| 3 | Misleading filing and payment statuses | **Unresolved** | `lib/cases.ts:353-372`: stage `filing` → "Filed — awaiting proof" whatever `filing_status` says; `abandoned` → "Complete". `components/live/payments-panel.tsx:291-292`: a payment the client only reported counts toward "Paid". Onboarding copy promises a "private tenant" that is never created (`lib/i18n-public.ts:131,170,207,383,422`). `delivery_requires_filing_outcome` lets an unfiled case be delivered when tax payment is `not_applicable` (verified live) |
| 4 | OTP authentication | **Resolved** (re-verified 30 Oct, live) | All five parts of the 27 Oct finding are closed. (a) `failed_attempts` is no longer reset on every issue: both `portal_issue_code` and `firm_issue_code` now zero it only `when otp_expires_at < now() - interval '30 minutes'`, so the five-try ceiling survives re-issues. (b) `portal_verify_code` and `firm_verify_code` are no longer executable by `anon`: their ACLs are `postgres` and `service_role` only, as are `portal_issue_code`, `firm_issue_code`, `portal_sign_in` and `portal_pending_code`. (c) One auth user can no longer be both: the `auth_identity_is_single` trigger raises `23505` on a `contacts` row whose sign-in belongs to a firm member, and the reverse. (d) `KIMA_DEMO_OTP_REVEAL=1` no longer reveals for any address in any environment: `mayRevealCode()` requires the flag **and** `VERCEL_ENV !== "production"` **and** a destination that cannot receive mail, and a failed send to a real address returns `send_failed` rather than the code — pinned by engine check T-18, including "production never reveals, even for an `example.*` address". (e) `app/api/portal/verify-code/route.ts` no longer answers `ok` without a session: it returns `no_destination` (422) when the contact has no address and `session_failed` (502) when minting fails. Separately, `app_flags.demo_otp_reveal` is false on production since 30 Oct |
| 5 | Cross-tenant access | **Partially resolved** | Every tenant table reads through `can_see_taxpayer()` (verified live; sound). Not resolved: storage (#1), and `member_has()` has no organisation scope, so any second firm's staff would see every taxpayer. Mitigated by PR #10 (firm sign-up hidden), not fixed |
| 6 | Wrong organisation or taxpayer assignment | **Unresolved** | `demoIds()` (`lib/supabase.ts:92`) still chooses the record for `profile-board` and `requests-board`. The firm's new-client wizard attaches every new taxpayer to `organizations … limit(1)` (`components/live/onboarding-wizard.tsx:136`). Fixed in Cursor's open PR #6 for engagements only |
| 7 | Migration consistency | **Resolved 27 Oct, 17:52 UTC** — owner approved; PR #6 merged with main (d6f9cca), the workflow ran green (run 40554572314) and applied `20261023180000`; production now has 42 migrations matching the repo. Original finding: | The production migration workflow **has failed on every push since 23 Oct** (Actions runs 39904684722, 39904841473, 39906939928, 39910478759). History diverged: the repo has `20261023052142_document_acceptance_snapshot`; production recorded the same SQL as `20261023052631`, plus `20261023052633_firm_confirms_service_payments`, which exists in no file on `main`. So **`20261023180000_public_onboarding_workspace_claims` never reached production** (`registrations.workspace_kind` does not exist there; the onboarding form survives only through its fallback insert). **Cursor's open PR #6 already contains the repair** (the rename to `052631`, plus the `052633` file); it has been open and unmerged since 23 Oct |
| 8 | Weak or misleading tests | **Unresolved** | `npm test` runs 9 engine checks (`scripts/engine-check.mjs`). Fixtures use invalid values (`type: "sarl"`, `billing_status: "not_quoted"`), so the obligation checks pass vacuously. There are **no database tests** (no RLS, policy or constraint test), **no route tests**, and **no browser or end-to-end tests** |

## 2. New findings from this audit

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| N-1 | **H** | The `auth-codes` Edge Function runs in production (v3, `verify_jwt = false`) but its source is in no repository. It ignores the result of the PATCH that binds `firm_members.auth_user_id` or `contacts.auth_user_id`, so a failed binding still returns success. Its code-reveal guard is better than the Next.js route's (operator flag **and** an undeliverable address) | `list_edge_functions` / `get_edge_function` (read-only) |
| N-2 | **H** | Clients can write fields that are not theirs. `messages.sender` is unconstrained, so a client can post as the firm. A client `documents` insert can set `review_status`, `acceptance` (the three verdicts) and `uploaded_by`. A client update on `document_requests` may change any column (labels, `due_on`, `case_id`, `returned_count`) as long as the status is in the allowed list | Verified live |
| N-3 | **M** | Writes refused by the database are shown as successes. The client profile updates `taxpayers` (only `case.advance` may), then shows "Saved". The client "report a payment" inserts into `service_payments` (only `payment.record` may). Client calls to `audit()` insert into `audit_events` (only firm capabilities may) | Verified live; `profile-board.tsx:99`, `payments-panel.tsx:170-185`, `lib/submit-request.ts:68` |
| N-4 | **M** | The realtime publication lacks `case_events`, `compliance_cases` and `case_tasks`, which the screens subscribe to, so "live" updates of those never arrive | Verified live |
| N-5 | **M** | The firm's new-client wizard inserts an engagement with `status: "authorized"` and does not check the insert result. The firm authorises itself, and a failure is silent | `components/live/onboarding-wizard.tsx:165-167` |
| N-6 | L | `registrations` accepts inserts from anyone, with no rate limit or abuse check | Verified live |

**Checked and sound:**
- `can_see_taxpayer()` on every table read.
- `case_events` is append-only (update, delete and truncate revoked).
- `filing_verified_requires_evidence`; `self_approval_must_be_disclosed`.
- `confirmed_requires_evidence` on `service_payments`.
- The code-issue functions are service-role only, and code hashes are unreadable by clients.
- Separation of duties in `lib/permissions.ts`; `kima_admin` has no professional authority.

## 3. Proposed corrections, as reviewable pull requests (await owner approval)

Each PR uses its own branch and is merged only after CI passes and the owner reviews it.
Nothing here is applied until the owner approves.

| PR | Fixes | What | Do not duplicate |
|---|---|---|---|
| **A0** | #7 | **Merge Cursor's PR #6** (or cherry-pick its two migration files if the owner wants the screens reviewed separately). Then confirm the workflow is green and production shows `registrations.workspace_kind` | PR #6 already has the fix |
| **A1** | #1, #2, #3 (DB part), N-2, N-4 | One forward-only migration: storage policies by the taxpayer segment of the path through `can_see_taxpayer()`; a `client_may_record()` allow-list matching `CLIENT_EVENT_KINDS` in `lib/events.ts`; firm cannot write as a client; `messages.sender` forced by role; client `documents` inserts pinned to pending / taxpayer / upload; a trigger limiting client updates on requests to `status`; delivery requires `filing_status = 'verified'`; realtime tables added | — |
| **A2** | #4, N-1 | Same migration family: no attempt reset on re-issue; verify RPCs revoked from anon/authenticated; one auth user is never both a firm member and a client. Code: reveal only with flag **and** `VERCEL_ENV ≠ production` **and** an undeliverable address; verify returns an error without a session or binding; commit the Edge Function source with binding checks, plus the Next.js → Edge Function relay so Vercel holds no service-role key. **The Edge Function redeploy needs its own go** | The relay already exists, uncommitted, in the second local checkout |
| **A3** | #3 (UI), N-3 | `clientStatus()` reads `filing_status`; new honest states; a single `clientStep()`; "Paid" only for confirmed money; "application", not "tenant"; refused writes are shown as refused | — |
| **A4** | #6, #8, N-5 | Session-scoped IDs instead of `demoIds()` and `limit(1)`; valid fixtures; an SQL negative-test suite in CI (§4) | PR #6 fixes engagements; do not redo |

A draft of A1–A3 exists as a **local, unpushed** commit (`p0-honesty-safety`), started under the owner's earlier "PROCEED". It will be rebased onto whatever the owner approves.

## 4. Test cases to add (pass/fail; any failure blocks merge)

SQL tests run in CI against a fresh local Supabase, with a JWT per role.

| # | Case | Expected |
|---|---|---|
| T-01 | Anon lists `kima-demo` with the demo flag off | 0 objects |
| T-02 / T-03 | Client A uploads to `A/…` / to or from `B/…` | Allowed / refused |
| T-04 | Firm reviewer reads an object under any taxpayer it can see | Allowed |
| T-05 | Client inserts `case_events.kind = filing_verified` | Refused |
| T-06 | Client inserts an event with `actor_role = firm_reviewer` | Refused |
| T-07 | Firm inserts an event with `actor_role = client` | Refused |
| T-08 | Client inserts a message with `sender = firm` | Refused |
| T-09 | Client inserts a document with `review_status = accepted` or `acceptance` set | Refused |
| T-10 | Client updates `document_requests.due_on` | Refused (a `status` change is allowed) |
| T-11 | Case set to `delivered` with `filing_status = not_submitted`, payment `not_applicable` | CHECK violation |
| T-12 | Anon calls `portal_verify_code` | Permission denied |
| T-13 | 5 wrong codes, re-issue, correct code | Still `too_many_attempts` |
| T-14 | Bind one auth user to a contact that is already a firm member | Refused |
| T-15 | Repo migration versions equal production `schema_migrations` | Equal (CI) |
| T-16 | `CLIENT_EVENT_KINDS` equals the SQL allow-list, and every kind is client-visible | Equal (engine) |
| T-17 | No stage × filing combination shows "complete" unless the filing is `verified`; `abandoned` never does | Pass (engine) |
| T-18 | Code reveal: production → no; real address → no; send failure → no; `example.com` in preview with the flag → yes | Pass (engine) |
| T-19 | A reported-only fee payment is never labelled "Paid" | Pass (engine) |
| T-20 | Fixtures use valid enum values | Pass (harness) |

## 5. Acceptance criteria for the security milestone

1. The migration workflow is green, and production history equals the repo (T-15).
2. T-01 … T-20 pass in CI on the merged commit.
3. On a Vercel preview, a signed-in synthetic client uploads a document and the firm
   previews it; a second synthetic client cannot (FR and EN).
4. No screen shows "Filed", "Paid", "Complete" or "Conforme" unless the matching
   dimension is verified (sweep at 375 and 1440 px).
5. Sign-in works without a service-role key in Vercel, and a code is never shown for a real address.
6. The Supabase security advisors raise no new warnings.
