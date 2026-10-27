# Agent A review of the A-owned parts of PR #6 (D2), plus D6 fee reporting

- **From → to:** Agent A → chief of staff, owner; Agent B for §3
- **Status:** answered (findings fixed in the PR that carries this note)
- **Blocks:** nothing. Board items A1, A2, A4 and D6 (Agent A side); B6 for Agent B

Reviewed: the #6 squash commit `d6f9cca` (`git show d6f9cca`), with production read
**read-only** (`pg_policy`, `pg_constraint`, `information_schema`,
`list_migrations`). Production migration history equals the repository (43 versions,
through `20261027120000`), so there is no drift.

## 1. Findings

| # | File | Finding | Severity | Action |
|---|---|---|---|---|
| R1 | `20261023052631_document_acceptance_snapshot.sql` | A pure rename of `20261023052142_*` (similarity 100%) so the file carries the version production recorded. `add column if not exists acceptance jsonb` plus a comment is idempotent and forward-only. Client writes to `acceptance` are already refused by the P0 migration (T-09). | None | None |
| R2 | `20261023052633_firm_confirms_service_payments.sql` | **Defect.** `for update using/with check (member_has('billing.manage'))` limits *who* updates, but not *which columns* or *from which status*. In the database a partner could rewrite `amount_minor`, `method`, `invoice_id`, `taxpayer_id` or `reported_by` on a client's report; reopen or rewrite a payment already confirmed or rejected; and write any name or time into `confirmed_by` / `confirmed_at`. Only the interface (`reviewServicePayment()`) refused it. | **High** (a receipt can appear, change or disappear) | **Fixed:** `20261027210000_service_payment_review_is_final.sql`. Trigger `service_payment_review_guard`: only `pending_confirmation` moves, only to `confirmed` or `rejected`; the payer's columns never change; a rejection carries no confirmation; on confirm the database stamps `confirmed_by` (the member's `person_label`, through `current_member_label()`) and `confirmed_at = now()`. Operators (no JWT, `postgres`/`service_role`) are not affected, as with `client_request_update_guard` |
| R3 | same table, older policy `"firm writes payments"` (`20261022181457`) | **Defect next to R2.** `with check (member_has('payment.record'))` let staff and reviewers (who lack `billing.manage`) insert a row already `confirmed`, or with `reported_by = 'taxpayer'`, skipping the review R2 now guards. No screen inserts as the firm today. | Medium | **Fixed in the same migration:** a firm insert must be `reported_by = 'firm'`, `pending_confirmation`, and carry no confirmation |
| R4 | same | Not organisation-scoped: `member_has()` ignores the organisation. Harmless with one firm; wrong with two. | High once a second firm exists | **Not built (D7).** Logged as blocking: backlog P2-5, risk R-47 |
| R5 | `lib/events.ts` | `engagement_revoked` now prints `— <reason>` in both locales. The kind is client-visible, so the revoke reason a partner types **is shown to the client**. React escapes it; no injection. It is still a free-text field that reaches the client. | Low (product) | Advisory for Agent B: the revoke form in `components/live/engagements-workspace.tsx` should say that the reason is shown to the client. `CLIENT_EVENT_KINDS` is unchanged by #6 (T-16 passes) |
| R6 | `scripts/engine-check.mjs` | The new checks (ledger balance, review, engagement timestamps, vault) are sound and pass. They test the TypeScript only, so they could not catch R2 or R3. | Info | Added **T-21**: it parses the migrations for the client policy and the review guard, and asserts the interface rule matches. It fails without the new migrations and passes with them |

Seen, but outside #6 and not changed here:
- `invoices` "scoped read" (`20261022181457`) dropped the original `status <> 'draft'`
  filter, so a client can read their own **draft** invoices through the API. The panel
  filters them out. Low; candidate for the next A PR.
- `client_taxpayer_ids()` does not check `contact_account_links.portal_access`. Low;
  same.

## 2. D6: clients may report fee payments

`20261027210100_client_reports_fee_payments.sql`:
- **`"client reports fee payments"`** (INSERT, `authenticated`): `status =
  'pending_confirmation'`, `reported_by = 'taxpayer'`, `confirmed_at` and
  `confirmed_by` null, `currency = 'XAF'`, `created_at = now()` (no backdating),
  `taxpayer_id in client_taxpayer_ids()`, and the invoice must be **issued** and belong
  to the same `taxpayer_id` and `organization_id` as the row.
- **`"client reads own payments"`** (SELECT): `taxpayer_id in client_taxpayer_ids()`.
  Clients had no read of their own payments before this.
- A client still has no UPDATE or DELETE path.

Tests: `supabase/tests/fee_payments_test.sql` (pgTAP, 24 checks, run by "Verify
migrations"): own invoice allowed; another taxpayer's invoice refused (both ways);
`confirmed`, a confirmation field, `reported_by = 'firm'`, a draft invoice, or a
backdated row refused; a client sees none of the other taxpayer's payments (A and B);
a client cannot confirm their own report; the R2/R3 guard cases for partner and staff.

## 3. For Agent B

- **`components/live/payments-panel.tsx` was not changed.** Its insert already matches
  the policy (session taxpayer, the invoice's `organization_id`, `pending_confirmation`,
  `reported_by: "taxpayer"`, no confirmation fields), and its select now returns the
  client's own rows. Once this PR merges and the migration is applied, the client
  "report a payment" works. **B6: nothing to hide** (D6 says no change if A lands first).
- `components/live/billing-workspace.tsx` keeps working: the confirm patch still sends
  `confirmed_by` / `confirmed_at`, and the database now overwrites them with the signed-in
  member's label and the server time. The optimistic row may show the browser's values
  until the reload that already follows.
- R5 above (revoke reason shown to the client) is yours to word.

## 4. A1 / A2 (auth-codes)

Recorded in `docs/deployment.md`, "auth-codes version history". In short: the live v5
equals `index.ts` on main (after line endings). v1 and v2 were 23 Oct, by hand. When v4
was deployed, and from where, **could not be determined** with read-only tools, beyond
"27 Oct, between the v3 fetch and 19:24 UTC, not from CI". There is no verbatim v3
copy. Git history at `63582e2` holds the v3-derived text, and the rollback target is the
file at `5a188c1`.

## Why

Owner decisions D2, D6 and D7 (`docs/agents/decisions/2026-10-27-owner-decisions.md`);
board items A1, A2 and A4.

## Done when

- "Verify migrations" passes `fee_payments_test.sql` on this PR (CI).
- After merge, the migrations workflow applies `20261027210000` and `20261027210100`,
  and `migration list --linked` shows no drift.
- Agent B confirms that B6 needs no change.
