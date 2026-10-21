# Entity Relationship Design

Blueprint deliverable **E**. Source: §11. All thirty named entities are present and
unrenamed. Anything marked **[ADDED]** is not in the blueprint and needs your approval.

## Scoping model — read this first

Three different scopes exist, and conflating them is the most likely source of a data
breach in this product:

| Scope | Meaning | Enforcement |
|---|---|---|
| **Tenant-scoped** | Belongs to one firm (`organization_id`) | RLS on `organization_id` |
| **Taxpayer-scoped** | Belongs to one taxpayer, independent of any firm | RLS on `taxpayer_id` |
| **Global** | Regulatory reference data, same for everyone in a jurisdiction | Read-only to tenants |

**Taxpayer ownership and firm engagement are separate concepts** (§11). A taxpayer's
documents belong to the taxpayer. A firm reaches them *only* through an active, authorized
`engagement`. Revoking the engagement revokes access without deleting anything.

## The two-status decision

`declarations` carries **two** status columns, deliberately:

- `internal_status` — the firm's real workflow: `draft`, `awaiting_documents`,
  `in_preparation`, `in_review`, `changes_requested`, `approved`, `submitted`,
  `filed`, `correction_open`, `closed`.
- `client_status` — the coarse taxpayer-visible state: `waiting_on_you`,
  `received`, `in_preparation`, `awaiting_approval`, `filed`, `action_needed`.

The mapping is explicit, stored and auditable. A firm can lag the client status behind
reality but cannot silently show something untrue, and taxpayer-facing queries never read
`internal_status`. This resolves the transparency-versus-incentives tension in the data
model rather than in UI copy.

## Conventions

- Surrogate `uuid` primary keys. No sequential ids in URLs (Scenario C).
- Money: **integer minor units** in an amount column plus a `currency` column.
  **XAF is a zero-decimal currency** — one unit is one franc, there are no centimes.
  Store XAF as whole francs with `currency='XAF'` and `scale=0`, keeping the scale explicit
  so a future two-decimal CEMAC currency needs no data migration. Never floating point.
- Every table carries `created_at`, `updated_at`, `created_by`. Soft delete only where
  legally permitted — evidence, approvals and audit are never deleted.
- Timestamps are `timestamptz` in UTC. Accounting periods and regulatory effective dates
  are **dates with an explicit jurisdiction**, never derived from a timestamp's local
  rendering.

## A. Identity and tenancy

| Entity | Key columns | Scope | Invariants |
|---|---|---|---|
| `organizations` | `id`, `name`, `type` (kima / firm), `country`, `status`, `locale_default` | global | A firm is activated only after manual review |
| `users` | `id`, `email` unique, `password_hash`, `mfa_enrolled`, `locale`, `status`, `last_login_at` | global | MFA required for privileged roles |
| `memberships` | `id`, `user_id`, `organization_id`, `role`, `status`, `invited_by` | tenant | Unique on (user, organization). Role is one of the matrix roles |
| `taxpayers` | `id`, `kind` (individual / business), `legal_name`, `trade_name`, `owner_user_id`, `country`, `status` | taxpayer | `owner_user_id` is the taxpayer's own account, **not** a firm |
| `taxpayer_tax_profiles` | `id`, `taxpayer_id`, `version`, `niu`, `tax_centre`, `taxpayer_category`, `tax_regime`, `accounting_framework`, `effective_from`, `effective_to`, `verified_by`, `verified_at`, `source_note` | taxpayer | **Versioned.** `tax_regime` and `accounting_framework` are independent columns — the system normal and SMT are not labels for the real and simplified regimes (§7.3). Never inferred from turnover |
| `engagements` | `id`, `organization_id`, `taxpayer_id`, `scope`, `status` (pending / authorized / suspended / revoked), `authorized_by_user_id`, `authorized_at`, `revoked_at`, `fee_terms` | both | The **only** bridge between a firm and a taxpayer. Authorization is given by the taxpayer and is revocable |

## B. Work and obligations

| Entity | Key columns | Scope | Invariants |
|---|---|---|---|
| `obligations` | `id`, `taxpayer_id`, `tax_rule_id`, `period_id`, `due_date`, `status`, `applicability_basis`, `verified` | taxpayer | Exists only from an **active, verified** `tax_rule`. An unverified rule yields no obligation |
| `accounting_periods` | `id`, `taxpayer_id`, `kind` (monthly / annual), `starts_on`, `ends_on`, `status` | taxpayer | No overlapping periods of the same kind |
| `document_requests` | `id`, `taxpayer_id`, `organization_id`, `period_id`, `document_type`, `reason`, `responsible_party` (taxpayer / firm), `status`, `due_at` | both | **Responsible party is explicit** — making the blocker visible is the product's job (§6.4) |
| `tasks` | `id`, `organization_id`, `taxpayer_id`, `assignee_user_id`, `title`, `due_at`, `status`, `priority` | tenant | Escalates when overdue (§7.4) |

## C. Documents and evidence

| Entity | Key columns | Scope | Invariants |
|---|---|---|---|
| `documents` | `id`, `taxpayer_id`, `request_id`, `period_id`, `document_type`, `classification_status`, `current_version_id`, `uploaded_by_user_id` | taxpayer | Preserves who uploaded it, when, for which taxpayer and period (§7.6) |
| `document_versions` | `id`, `document_id`, `version`, `storage_key`, `sha256`, `mime_type`, `byte_size`, `av_scan_status`, `uploaded_by`, `review_status` | taxpayer | **Immutable.** Replacement creates a new version. Scanned and type-verified before it becomes readable |
| `submission_evidence` | `id`, `declaration_id`, `kind` (acknowledgment / receipt / portal_capture / integration_response), `document_version_id`, `reference`, `captured_by`, `captured_at` | taxpayer | **Gates filed status.** Never synthesized by the system |
| `tax_payment_evidence` | `id`, `taxpayer_id`, `obligation_id`, `amount`, `currency`, `paid_at`, `reference`, `document_version_id` | taxpayer | Government tax payments — distinct from Kima's own service fees |

## D. Financial import and DSF preparation

| Entity | Key columns | Scope | Invariants |
|---|---|---|---|
| `source_imports` | `id`, `organization_id`, `taxpayer_id`, `period_id`, `source_system`, `original_document_version_id`, `parse_status`, `detected_profile`, `row_count`, `parse_report` | both | **Original file preserved verbatim.** Parsing never mutates the source |
| `accounting_mappings` | `id`, `organization_id`, `profile_name`, `account_pattern`, `target_field`, `transform`, `reviewed_by`, `reviewed_at`, `version` | tenant | Reusable reviewed configuration. Ambiguity is resolved by a human, never guessed |
| `dsf_preparations` | `id`, `taxpayer_id`, `period_id`, `accounting_framework`, `dsf_template_version`, `status`, `prepared_by`, `reviewed_by` | taxpayer | Template follows `accounting_framework`, **not** `tax_regime`. Applicability must be established, not assumed |
| `dsf_field_values` | `id`, `preparation_id`, `field_code`, `value_amount`, `currency`, `derivation` (JSON: source rows, accounts, formula), `override_value`, `override_reason`, `override_by` | taxpayer | **Source-to-result traceability is mandatory.** Every value explains its origin. An override requires a reason and is audited (Scenario D) |
| `validation_findings` | `id`, `preparation_id`, `check_code`, `severity`, `message`, `status`, `resolved_by`, `resolution_note` | taxpayer | Deterministic checks. Blocking findings prevent approval |

## E. Declarations, review, corrections

| Entity | Key columns | Scope | Invariants |
|---|---|---|---|
| `declarations` | `id`, `taxpayer_id`, `organization_id`, `obligation_id`, `period_id`, `preparation_id`, `internal_status`, `client_status`, `approved_version_id`, `filed_at` | both | Two statuses, as above. `filed_at` requires `submission_evidence` (Scenario F) |
| `approvals` | `id`, `declaration_id`, `declaration_snapshot_id`, `reviewer_user_id`, `checklist_result`, `decision`, `decided_at`, `note` | both | **Append-only.** Reviewer must differ from preparer. The snapshot preserves the exact reviewed version (§11) |
| `correction_cases` | `id`, `declaration_id`, `opened_by`, `reason`, `status`, `assigned_to`, `resolved_at`, `resolution_note` | both | Scenario G: reason, correspondence, follow-up, verified resolution |
| `correspondence` | `id`, `correction_case_id`, `taxpayer_id`, `direction` (inbound / outbound), `channel`, `subject`, `body`, `document_version_id`, `sent_at`, `drafted_by`, `approved_by` | both | AI may draft; a human approves before anything leaves |

## F. Communication and billing

| Entity | Key columns | Scope | Invariants |
|---|---|---|---|
| `messages` | `id`, `thread_id`, `taxpayer_id`, `organization_id`, `sender_user_id`, `body`, `attachment_version_id`, `sent_at`, `read_at` | both | Private to the taxpayer and firm pair. Never cross-tenant |
| `notifications` | `id`, `user_id`, `channel` (in_app / email / whatsapp), `template`, `payload`, `consent_basis`, `status`, `sent_at`, `read_at`, `failure_reason` | both | Channel requires recorded opt-in. WhatsApp only where approved (§10 P1) |
| `invoices` | `id`, `organization_id`, `taxpayer_id`, `number`, `currency`, `total_amount`, `status`, `issued_at`, `due_at`, `lines` | both | Kima and firm service fees. Immutable once issued |
| `service_payments` | `id`, `invoice_id`, `amount`, `currency`, `method`, `provider_reference`, `paid_at`, `status` | both | Approved providers only (§10 P1) |

## G. Regulatory reference — global

| Entity | Key columns | Scope | Invariants |
|---|---|---|---|
| `regulatory_sources` | `id`, `jurisdiction`, `kind` (legislation / circular / ohada / guide / commentary), `title`, `citation`, `url`, `archived_copy_key`, `published_on`, `retrieved_at` | global | Hierarchy per §13. An **archived copy** is kept — official URLs move |
| `tax_rules` | `id`, `jurisdiction`, `version`, `supersedes_id`, `taxpayer_category`, `tax_regime`, `accounting_framework`, `obligation_type`, `period_kind`, `filing_deadline_rule`, `effective_from`, `effective_to`, `source_id`, `verification_status`, `verified_by`, `verified_at` | global | **Versioned, never deleted.** Verification required before it can drive an obligation. Historical periods keep resolving against the version in force at the time |
| `audit_events` | `id`, `occurred_at`, `actor_user_id`, `actor_role`, `organization_id`, `taxpayer_id`, `action`, `resource_type`, `resource_id`, `before`, `after`, `ip`, `user_agent`, `request_id` | both | **Append-only, immutable for every role.** All material status changes recorded (§11) |

## H. Reviewer pool — [ADDED], approved 2026-10-20

Decided after the blueprint was written: Kima runs a **pool of qualified reviewers** who
sign up directly, rather than depending on one expert. This resolves the solo-practitioner
problem in Scenario E — a one-person firm routes review to the pool instead of
self-approving — and it pulls a scoped-down form of the blueprint's P2 "accountant
marketplace" (§10) forward into the core. That reordering is deliberate and should be
acknowledged as a change to the baseline.

Two distinct reviewer jobs exist and must not be merged:
**declaration review** (approving a client's filing) and **rule verification**
(activating a tax rule). A reviewer may hold either capability, or both.

| Entity | Key columns | Scope | Invariants |
|---|---|---|---|
| `reviewer_profiles` | `id`, `user_id`, `credential_type`, `licence_number`, `issuing_body`, `jurisdiction`, `specialisations`, `can_approve_declarations`, `can_verify_rules`, `verification_status`, `verified_by`, `verified_at`, `capacity_per_week`, `status`, `engaged_via` (kima_pool / firm_internal / external_named) | global | A reviewer cannot act until `verification_status='verified'`. Credentials are checked by Kima against the issuing body, and that check is recorded, not assumed |
| `review_assignments` | `id`, `declaration_id`, `reviewer_user_id`, `source`, `assigned_by`, `assigned_at`, `accepted_at`, `due_at`, `status` (offered / accepted / declined / completed / expired / withdrawn), `conflict_declared`, `completed_at` | both | **Grants narrow, time-boxed access** — see below. One active assignment per declaration |

### Reviewer access is narrow by construction

A pool reviewer is **not** a member of the firm and gets **no** engagement. An accepted
`review_assignment` grants read access to exactly:

- the declaration under review and its approved-candidate snapshot,
- its `dsf_preparation`, `dsf_field_values` and `validation_findings`,
- the `document_versions` cited as supporting evidence for that period,
- nothing else — not the client list, not other periods, not messages.

Access ends when the assignment reaches `completed`, `declined`, `expired` or `withdrawn`.
Every reviewer read is written to `audit_events` and is visible in the taxpayer's own
access history. This is a **fourth** access path alongside taxpayer ownership, firm
engagement and platform support, and it needs its own RLS policy and its own negative
tests — a reviewer reaching anything outside their assignment is a breach.

### Consequences elsewhere

- `approvals.reviewer_user_id` may now reference a user outside the firm. The
  no-self-approval rule is unchanged and becomes satisfiable for solo firms.
- A **conflict-of-interest declaration** is required before an assignment is accepted;
  a reviewer must be able to decline without giving a reason.
- Sharing taxpayer financial data with an external professional needs a **lawful basis and
  taxpayer notice** under Law 2024/017 — see R-33.
- Paying reviewers is out of scope for now. Note that `invoices` and `service_payments`
  currently model money flowing *to* Kima, not *from* it.

## Coverage check

All thirty blueprint entities appear above, unrenamed: organizations, users, memberships,
taxpayers, taxpayer_tax_profiles, engagements, obligations, accounting_periods,
document_requests, documents, document_versions, source_imports, accounting_mappings,
dsf_preparations, dsf_field_values, validation_findings, declarations, approvals,
submission_evidence, correction_cases, correspondence, tasks, messages, notifications,
invoices, service_payments, tax_payment_evidence, regulatory_sources, tax_rules,
audit_events.

Beyond those thirty, two entities are **[ADDED]** and approved: `reviewer_profiles` and
`review_assignments` (section H). One more is **[ADDED] and pending**: the channel-agnostic
intake queue (below). Nothing else was invented.

## Open modelling questions

1. ~~**Single-professional firms.**~~ **Resolved 2026-10-20:** a solo firm routes review to
   a Kima pool reviewer. No self-approval exception is needed, so none is granted.
2. **Multiple firms per taxpayer.** Can a taxpayer engage two firms at once, for example
   while switching accountants mid-year? The current design allows it, which affects what
   "the assigned accountant" means in the portal. **Still open.**
3. **Intake queue — [ADDED], needed.** WhatsApp-in is deferred, but email-in has the same
   shape: an item arrives with no `taxpayer_id`, period or request. It must land in a
   channel-agnostic intake queue and be bound by a human before becoming a `document`.
   See `sage-dsf-ingestion-research.md` §6. **Should not be retrofitted onto `documents`.**
4. **Retention.** Law 2024/017 plus tax record-retention duties determine how long evidence
   lives and what deletion means in an immutable vault. Legal input required before Phase 5.
5. **Note ageing input.** Maturity splits the DSF notes require cannot be derived from a
   trial balance, so they need their own structured entity or a typed field set on
   `dsf_preparations`. **Open until the real workbook is in hand.**
