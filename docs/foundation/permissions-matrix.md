# Permissions Matrix

Blueprint deliverable **F**. Source: §11 (data architecture), §14 (security), Scenario C.

Authorization is **deny by default**. Every check answers three questions in order:
1. **Who** — authenticated principal and role.
2. **Where** — which tenant (`organization_id`) or which taxpayer.
3. **Why** — for firm access to a taxpayer, an *active engagement authorized by that taxpayer*.

Role alone never grants access. `firm_accountant` of Firm A has no permission over Firm B,
and no permission over a Firm A taxpayer they are not assigned to where assignment-scoping
is enabled.

## Roles

| Role | Belongs to | Notes |
|---|---|---|
| `anonymous` | — | Public site only |
| `taxpayer_owner` | a taxpayer record | The taxpayer themself, or the business's responsible person |
| `taxpayer_delegate` | a taxpayer record | Invited by the owner, e.g. a bookkeeper or spouse; scope-limited |
| `firm_assistant` | an organization | Collects and organizes documents; cannot prepare or approve |
| `firm_accountant` | an organization | Prepares work; cannot approve own work |
| `firm_reviewer` | an organization | Authorized professional reviewer; can approve declarations |
| `firm_owner` | an organization | Manages staff, billing, firm settings |
| `external_reviewer` | nobody — signs up with Kima directly | **[ADDED] 2026-10-20.** A credential-verified professional in Kima's reviewer pool. Belongs to no firm and holds no engagement; reaches data only through an accepted `review_assignment`, and only that declaration's own records |
| `platform_support` | Kima | Read-only operational access, every read audited |
| `platform_reviewer` | Kima | Qualified tax reviewer; verifies and activates tax rules. A **different job** from reviewing a client declaration |
| `platform_admin` | Kima | Platform configuration; **not** a shortcut into taxpayer data |
| `system_worker` | — | Background jobs; narrow service scope, never interactive |

**Privileged roles — `firm_owner`, `firm_reviewer`, `external_reviewer`, `platform_*` —
require MFA** (§14).

### Reviewer capabilities are data, not role names

`reviewer_profiles.can_approve_declarations` and `.can_verify_rules` decide what a verified
reviewer may actually do. `firm_reviewer` and `external_reviewer` describe *where the
reviewer comes from*; the capability flags describe *what they are qualified for*. A
reviewer with neither flag set can do nothing, which is the default on sign-up.

### Reviewer scope — the fourth access path

Taxpayer ownership, firm engagement, platform support and now **review assignment** are
four separate ways to reach data. An accepted assignment grants read-only access to
exactly the declaration under review, its preparation, field values, validation findings,
and the document versions cited as its supporting evidence — nothing else. Access lapses
the moment the assignment leaves `accepted`. Every reviewer read is audited and surfaced in
the taxpayer's own access history.

## Legend

`C` create · `R` read · `U` update · `D` delete · `A` approve · `X` export ·
`—` no access · `*` conditional, see notes

## Matrix

| Resource | taxpayer_owner | taxpayer_delegate | firm_assistant | firm_accountant | firm_reviewer | firm_owner | platform_support | platform_admin |
|---|---|---|---|---|---|---|---|---|
| organization | — | — | R | R | R | RU | R | CRUD |
| membership / staff | — | — | R | R | R | CRUD | R | CRUD |
| taxpayer record | R U* | R | R* | R* | R* | R* | R | R |
| taxpayer_tax_profile | R | R | R* | R U* | R U* | R* | R | R |
| engagement | R A* D* | — | R | R | R | CRU | R | R |
| obligation | R | R | R | R U* | R U* | R | R | R |
| accounting_period | R | R | R | CRU* | CRU* | R | R | R |
| document_request | R | R | CRU* | CRU* | CRU* | R | R | — |
| document (upload) | C R | C R | C R U* | C R U* | C R | R | R* | — |
| document_version | R | R | C R | C R | R | R | R* | — |
| source_import | — | — | C R* | C R U* | R | R | R* | — |
| accounting_mapping | — | — | — | C R U* | C R U A* | R | R* | — |
| dsf_preparation | — | — | — | C R U* | R U A X* | R | R* | — |
| dsf_field_value | — | — | — | R U* | R U A* | R | R* | — |
| validation_finding | — | — | R* | R U* | R U A* | R | R* | — |
| declaration | R* | R* | R | C R U* | R U A* | R | R* | — |
| approval | — | — | — | — | C R* | R | R | — |
| submission_evidence | R | R | C R* | C R* | C R | R | R | — |
| correction_case | R* | — | R | C R U* | C R U A* | R | R | — |
| correspondence | R* | — | R | C R U* | C R U* | R | R | — |
| task | R* | — | R U* | C R U* | C R U* | C R U | R | — |
| message | C R* | C R* | C R | C R | C R | R | R* | — |
| notification | R | R | R | R | R | R | R | R |
| invoice | R | — | R | R | R | C R U | R | R |
| service_payment | C R* | — | R | R | R | R U | R | R |
| tax_payment_evidence | C R | C R | C R | C R U | C R U | R | R | — |
| regulatory_source | R* | R* | R | R | R | R | R | C R U |
| tax_rule | R* | R* | R | R | R | R | R | C R U |
| tax_rule activation | — | — | — | — | — | — | — | **A only by `platform_reviewer`** |
| audit_event | R* | — | — | R* | R* | R* | R | R |

## Conditions

| # | Condition |
|---|---|
| 1 | **Taxpayer self-scope.** `taxpayer_owner` / `taxpayer_delegate` reach exactly one taxpayer's records — their own. Enforced by RLS, not by route. |
| 2 | **Firm scope requires engagement.** Any firm role reaching a taxpayer requires an `engagement` that is active, for that `organization_id`, and **authorized by the taxpayer**. Revoking authorization removes access immediately and is audited. |
| 3 | **Assignment scoping.** Where a firm enables it, `firm_assistant` and `firm_accountant` see only taxpayers assigned to them. `firm_owner` and `firm_reviewer` see the whole portfolio. |
| 4 | **No self-approval.** The reviewer who approves a declaration must not be the user who prepared it. Enforced in data, not in UI. **Resolved 2026-10-20:** a solo firm satisfies this by routing review to an `external_reviewer` from Kima's pool, so no exception and no silent bypass is needed. |
| 4a | **Reviewer must be verified and capable.** An approval requires `reviewer_profiles.verification_status='verified'` **and** `can_approve_declarations`. Sign-up alone grants nothing. |
| 4b | **Assignment before access.** An `external_reviewer` with no accepted `review_assignment` has no access to any taxpayer record. The assignment is the grant; revoking, declining, completing or expiring it ends access immediately. |
| 4c | **Conflict of interest.** A reviewer declares any conflict before accepting, and may decline without stating a reason. A declined assignment leaves no residual access. |
| 5 | **Approval is append-only.** `approvals` are never updated or deleted. A withdrawn approval is a new record, and the approved declaration version is preserved byte-for-byte. |
| 6 | **Filing status is evidence-gated.** No role, including `platform_admin`, can set a declaration to filed without `submission_evidence` or an identified authorized integration response (Scenario F). |
| 7 | **Tax rule activation is reserved.** Authoring is `platform_admin`; **activation is `platform_reviewer` only**. An unverified rule may exist but may never drive a user-visible obligation or deadline. |
| 8 | **Rules and sources are public-ish, versions are not deletable.** Taxpayers and firms read active rules; nobody deletes a version that a historical period relied on. |
| 9 | **Document mutation.** Uploaders may replace a document with a new *version*; existing versions are immutable. Only `firm_accountant`+ may reject or reclassify. |
| 10 | **Audit is append-only for everyone.** No role has `U` or `D` on `audit_events`. Taxpayers read their own access history; firm roles read their tenant's. |
| 11 | **Platform access is visible.** `platform_support` reads of taxpayer documents are themselves audited and surfaced to the taxpayer's access history. Support is not invisible. |
| 12 | **Clarity AI inherits, never widens.** The assistant executes under the calling principal's scope. It cannot read a record the caller could not read, and cannot perform an action the caller lacks. It never holds `A` on anything. |
| 13 | **`system_worker`** gets per-job narrow grants (parse this import, send this notification) and is never a general-purpose superuser. |

## Negative tests — required from Phase 3, not at launch

Scenario C is a correctness property. These run in CI from the first schema commit:

- Firm A principal reading a Firm B taxpayer, document, declaration, import → **denied**.
- Taxpayer reading another taxpayer by guessed id or direct URL → **denied**.
- Firm with a *revoked* or *pending* engagement → **denied**.
- `firm_accountant` approving a declaration → **denied**.
- Preparer approving their own work → **denied**.
- Any principal setting filed status without evidence → **denied**.
- Any principal activating an unverified tax rule → **denied**.
- Any principal updating or deleting an `audit_event` → **denied**.
- Unassigned staff reading a client under assignment scoping → **denied**.
- `external_reviewer` with no accepted assignment reading any taxpayer record → **denied**.
- `external_reviewer` reading a client list, another period, messages, or a declaration
  outside their assignment → **denied**.
- `external_reviewer` whose assignment is completed, declined, expired or withdrawn
  reading the previously assigned declaration → **denied**.
- Unverified reviewer, or verified reviewer lacking `can_approve_declarations`, approving a
  declaration → **denied**.
- RLS verified with the application's own database role, not a superuser connection.
