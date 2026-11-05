# Phase 2 isolated-staging advisor disposition register

**Snapshot:** 2026-10-31, approximately 02:41 UTC. **Project:** `usrnjhuwmhxelkpqgyox` (isolated staging only).
**Status:** proposed dispositions for independent security review; **NOT** approval to merge, deploy, or enable public signup.
This is an evidence register, not proof that a pending PR was deployed.

## Verified staging baseline

- `supabase_migrations.schema_migrations`: **69 applied**; last `20261030220000_shared_niu_lock_for_direct_client_files`.
- `public.app_flags.allow_firm_signup`: **false** (read-only SQL check).
- Security Advisor: **1 INFO** (RLS/no policy), **1 WARN** (anon-executable definer), **5 WARN** (authenticated-executable definers).
- Performance Advisor: **18 INFO** unindexed foreign-key findings.
- Three sampled proposed indexes (`account_tags_tag_id_idx`, `contacts_organization_id_idx`,
  `compliance_cases_organization_id_idx`) are **absent** from hosted staging.
- Public-schema `SECURITY DEFINER` functions executable by anon/authenticated: **5**.
- `anon` and `authenticated` have **no CREATE privilege** on `public` or `private` schemas.
- The results are point-in-time observations; rerun both advisors and catalog checks after migration replay.

## Security Advisor: proposed disposition (requires human signoff)

| Advisor | Object | Disposition / control | Outstanding proof |
| --- | --- | --- | --- |
| 0008: RLS with no policy (INFO) | `public.app_flags` | **Intended deny-all API surface.** No browser access to internal flags. The `private.flag_enabled()` helper reads them inside controlled code; `20261030020000` documents and revokes direct grants. | Verify no anon/authenticated SELECT privilege and flag OFF after every deploy. |
| 0028: anonymous definer (WARN) | `public.firm_directory()` | **Proposed exception.** Deliberate public directory for firm selection, returning only `id`, `name`, and KIMA's narrow `verification_status` label. Excludes suspended and non-firm organizations; no arguments or writes. Residual risk: public enumeration of firm names is product-authorized. | Human review of exact function body, return columns, GRANTs, and RLS isolation; check FR/EN wording does not imply professional certification. |
| 0029: authenticated definer (WARN) | `public.firm_directory()` | Same intentional narrow directory exception as above; counted separately by the advisor. | Same verification. |
| 0029: authenticated definer (WARN) | `public.can_write_client_note(uuid)` | **Proposed exception.** Boolean preflight for `/api/inquiry`, scoped to caller's accepted engagement through `private.member_has`; no row payload. `definer_surface_test.sql` exercises allowed/denied paths. | Verify anon EXECUTE denied, cross-tenant false, and no leak of protected identifiers. |
| 0029: authenticated definer (WARN) | `public.sign_up_firm(text,text,text)` | **Proposed exception.** Requires confirmed Supabase Auth identity; creates unverified firm, partner, and audit atomically; `allow_firm_signup` OFF. `firm_signup_atomic_test.sql` and `two_new_firms_signup_test.sql` provide synthetic coverage. Residual risk R-57: brand impersonation by a person controlling an email, mitigated by unique normalized names/numbers, verification labels, suspension, and audit. | Real OTP rate-limit and FR/EN signup acceptance; keep flag OFF until separate explicit activation approval. |
| 0029: authenticated definer (WARN) | `public.manage_firm_staff(text,uuid,text,text,firm_role)` | **Proposed exception.** Bound active firm partner only; staff/reviewer invite, role, revoke; excludes partner/admin elevation and cross-firm writes. `firm_staff_management_test.sql` covers negative paths. | Independent privilege review and hosted revoke/session acceptance. |
| 0029: authenticated definer (WARN) | `public.admin_review_firm(uuid,text,text)` | **NOT YET ACCEPTED.** KIMA-admin-only, audit-required verify/suspend/unsuspend RPC. The integrated implementation writes the private review reason into the *reviewed firm's* audit scope. Draft **#71** moves it into KIMA's own audit scope with pgTAP denial tests. | **Block until #71 has exact-head green checks, independent human approval, integration, and staging audit privacy verification.** |

Advisor reference: https://supabase.com/docs/guides/database/database-linter
and specific lints:
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy ,
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable ,
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .

## Performance Advisor: proposed remediation, not deployed

All **18** current `unindexed_foreign_keys` INFO findings are assigned to three
draft, unmerged PRs. None is marked resolved until the migrations are applied to
staging and the advisor reruns with zero corresponding findings.

- **#85** (54 changed lines): `contacts.organization_id`,
  `registrations.organization_id`, `registrations.taxpayer_id`.
- **#94** (73 changed lines): `compliance_cases.organization_id`,
  `declarations.organization_id`, `document_requests.organization_id`,
  `messages.organization_id`, `service_payments.organization_id`.
- **#95** (95 changed lines): `account_tags.tag_id`,
  `accounting_periods.taxpayer_id`, `audit_events.actor_member_id`,
  `case_events.taxpayer_id`, `documents.request_id`,
  `engagements.taxpayer_id`, `messages.request_id`,
  `portal_accounts.contact_id`, `validation_findings.taxpayer_id`,
  and the composite `document_requests(case_id,taxpayer_id)`.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys .
Index creation may affect deployment time and write performance; inspect plans
and actual staging advisor results rather than treating an index name as proof.

## Required release verification after independent approvals

1. Merge only individually approved Phase 2 PRs into the Phase 2 integration
   branch, in dependency order; no Phase 3/4 changes. Do not merge #64 into main
   while its 4,685-line aggregate and the per-PR size policy remain unresolved.
2. Run exact-integration-head CI and **two** clean migration replays, including
   #78's cross-entrypoint two-session NIU race test and #80's actual lock-wait
   assertion. Distinguish local PostgreSQL concurrency from hosted overlap.
3. Replay reviewed forward-only migrations to isolated staging using authorized
   credentials. Confirm schema history and rerun **both** advisors. Log each
   finding's resolved status or reviewed exception with approver and date.
4. Verify `app_flags.allow_firm_signup=false`, authenticated privilege
   boundaries, KIMA-only private audit events, suspended-firm denial, two
   independent synthetic firm signups and client onboarding, cross-tenant denial,
   FR/EN/mobile acceptance, and Vercel preview on the exact commit.
5. Require **recorded independent GitHub human approval per PR**, including
   #68–#73, #71, #78, #80, #81, #85, #94, and #95. Automated reviews and
   owner chat authorization do not substitute. Record any explicit exceptions
   under team policy; never invent approvals.
6. Only after every gate passes may the owner-authorized Phase 2 release proceed
   with a SHA lease and post-deploy verification. **Do not activate public signup.**

**This register does not waive any security finding or release gate.**
