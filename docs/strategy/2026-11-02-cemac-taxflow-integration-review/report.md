# KIMA OS — CEMAC TaxFlow Integration Decision Report

**Prepared:** 2 November 2026  
**Status:** Architecture and product decision proposal; documentation only  
**Repository reviewed:** [Chedarl/KIMA-CONSULTING](https://github.com/Chedarl/KIMA-CONSULTING), `main`  
**Decision authority:** KIMA OS blueprint, `CLAUDE.md`, owner release gates and reviewed source evidence  
**Scope:** Three proposals supplied on 2 November: (1) CEMAC TaxFlow core architecture and illustrative SQL; (2) four-zone Senior Accountant Dashboard; (3) TaxDome-like CEMAC business positioning.

> **Executive decision:** Retain the **KIMA OS** name and its shared firm–taxpayer compliance architecture. Adopt the proposals as *requirements input*, not as a replacement system or as live integrations. Build the useful capabilities incrementally in existing KIMA entities and routes. No new government connection, tax rule, filing authorization or real-client-data permission is approved by this report.

## 1. Evidence and review limits

This report compares the three submitted proposals against the following files read from `main`:

- [`README.md`](../../../README.md) — advertised architecture, engines, release gates and historical implementation record.
- [`CLAUDE.md`](../../../CLAUDE.md) — product precedence, tax-rule provenance, scope, security and deployment restrictions.
- [Blueprint v1.0](../../blueprint/kima-compliance-os-blueprint-v1.0.md) — controlling original product intent.
- [Application sitemap](../../foundation/sitemap.md) and [entity-relationship design](../../foundation/erd.md) — intended routes and canonical records; design entities are **not** all necessarily deployed tables.
- [Sage/DSF ingestion research](../../foundation/sage-dsf-ingestion-research.md), [rule engine](../../../lib/rules.ts), [case engine](../../../lib/cases.ts), [document review](../../../lib/document-review.ts).
- [29 October QA and adoption plan](../2026-10-29-qa-and-adoption/plan.md) and [agent ownership rules](../../../AGENTS.md).

GitHub metadata checked on 2 November showed [PR #140](https://github.com/Chedarl/KIMA-CONSULTING/pull/140) open and non-mergeable, [PR #153](https://github.com/Chedarl/KIMA-CONSULTING/pull/153) open/draft, and [PR #193](https://github.com/Chedarl/KIMA-CONSULTING/pull/193) open/draft on a stacked, non-`main` base. These are **point-in-time observations**, not a fresh CI, deployment, database, or runtime audit. The README contains older dated statements that must not be mistaken for present-day operational evidence.

External grounding: the [Cameroon DGI ACF page](https://impots.cm/index.php/fr/node/512) identifies the ACF as an official electronic document concerning filing and payment compliance, and the [DGI's 2024 explanation](https://www.impots.cm/en/node/119) states that the ACF replaced the former ANR. Neither source establishes KIMA API access. No authoritative technical contract was established for automated Harmony/SIGINT/Fiscalis submission, bulk receipt harvesting, e-invoicing relays, or portal uptime monitoring.

## 2. Decision summary

**KEEP**: TaxDome-like **practice management**; a Cameroon-first bilingual and mobile-aware product; the existing KIMA firm/taxpayer relationship model; a high-density senior accountant dashboard; secure document intake; team assignments; immutable evidence; exception management; traceable SYSCOHADA-to-DSF preparation; ACF tracking; manual portal evidence capture.

**MODIFY**: The sample SQL; the four-zone dashboard; batch approval and signing; monthly countdown and obligation generation; the “offline queue”; Mobile Money payment matching; regional portal names and health labels; global search; claim of “45 minutes per client”; certificate and payment labels; the assumption that accounting and tax systems offer standard integrations.

**DEFER behind explicit validation**: WhatsApp Business integration, SMS, USSD, accounting imports beyond verified sample formats, partner payment initiation, live status checks, portal connectors, automatic receipt retrieval, fiscalization relay, and direct government filing.

**REJECT as proposed**: Replacing KIMA with “CEMAC TaxFlow”; importing the standalone schema as a migration; parallel firm/user/client records; plain or reversibly retrievable government credentials as a default feature; global 15th-of-month deadline; auto-filing just because connectivity recovers; one-click approval that also submits; fictitious green portal health; “paid” inferred from a debit; “filed” inferred from an attempt; current ANR treated as equivalent to ACF; unsupported performance claims.

## 3. Proposal-by-proposal integration matrix

| Proposed element | Decision | Existing KIMA anchor / required correction | Priority |
|---|---|---|---|
| Firm practice management / multi-client portfolio | **Keep** | `organizations`, `firm_members`, `taxpayers`, `engagements`; enforce engagement-granted firm reach | P0–P1 |
| Client portal and bilingual app | **Keep** | Existing `/app` and `/workspace` boundaries, typed FR/EN dictionaries | P0–P1 |
| Independent firms as subscribers | **Keep; validate** | QA plan prefers firm subscriptions; pricing, billing product and willingness-to-pay remain unproven | Pilot |
| Six-country CEMAC architecture | **Keep as design** | `Jurisdiction` union: CM/GA/CG/TD/CF/GQ; each country requires independently verified rule pack | P3 |
| Proposed `firms` / `users` / `clients` SQL | **Reject schema replacement** | Duplicates canonical identity and breaks taxpayer portability/many-to-many engagements | Never |
| `government_credentials` with password storage | **Defer / redesign** | No credential collection until connector authority, least-privilege and vault controls are proven | P3 |
| Smart filing retry queue | **Modify** | Support durable local *preparation* and an audited outbound queue only for authorized, idempotent integration | P2–P3 |
| Automatic online portal submission | **Defer** | Requires written authorization, official contract, per-filing human signoff, safe retry semantics | P3 |
| Instant e-invoicing / Section M 8e relay | **Hold as unverified** | Verify exact legal basis, effective period, taxpayer coverage, data schema and authorized access | Research |
| Automatically harvested receipts / ACF | **Split** | Manual evidence and expiry tracking now; machine retrieval only with validated connector | P1 / P3 |
| SYSCOHADA import, journal review, DSF mapping | **Keep / extend** | Reuse `source_imports`, mapping, DSF and validation concepts; preserve original and account-root mapping | P2 |
| Monthly auto-generated obligations | **Modify** | Only active, source-verified rules from `lib/rules.ts`; no generic 15th deadline | P1 |
| DSF annual manager | **Keep / extend** | Reuse DSF Bridge routes and original official workbook, exact preparation snapshot | P2 |
| Immutable evidence and audit trail | **Keep / harden** | Existing `documents`, `case_events`, evidence references; versioning, retention and backup controls | P0–P1 |
| WhatsApp document uploads and reminders | **Defer / stage** | Start with in-app/email notices and uploads; later authorized Business API, opt-in, channel verification | P2 |
| USSD support | **Narrow scope** | Low-risk notifications/checklists may fit; never accept confidential files or credentials through USSD | Explore |
| MTN/Orange, TresorPay and bank tracking | **Modify / phase** | Split **firm fees** from **government tax payments**; a debit is not a DGI quittance | P1–P3 |
| Generic Sage/QuickBooks/Xero connectors | **Defer breadth** | Start with sanitized, practitioner-verified Sage/Excel import layouts; do not claim API support | P2–P3 |
| Dashboard four zones | **Keep, adapt** | `/workspace` overview + focused `/queue` / review / deadlines; permissions and real status source | P1 |
| Four KPI cards | **Keep as queries** | Computed from authorized firm cases and verified deadlines/evidence; mock counts never advertised as live | P1 |
| Kanban and dense table toggle | **Keep** | One shared server-backed dataset, URL filters, accessible bulk selection, RLS | P1 |
| Batch actions | **Limit** | Assign, request, remind, export; never mass e-sign or submit without item-level control | P1 / P3 |
| Side-by-side senior review drawer | **Keep, gate** | Immutable version, source-vs-calculation diff, qualified independent reviewer, audit and revalidation | P1–P2 |
| “Review & Sign” auto-queues to DGI | **Reject** | Review approval, client consent when needed and submission authorization are distinct transitions | Never |
| Live Harmon/SIGINT/Fiscalis traffic lights | **Reject until proven** | Show `Not connected` / `Unknown` / `Manual capture`; last check and provenance if connector exists | P3 |
| Universal search by NIU, hash, receipt | **Modify** | Firm/engagement-scoped only; sensitive indices, masked identifiers, no search-based authorization | P1 |
| 45-minute filing promise / 89% captured | **Replace with hypotheses** | Pilot baseline; measure prep, review, collection and proof retrieval separately | Pilot |

**Priority legend:** P0 = launch-blocking security and correct shared records; P1 = near-term operability; P2 = accounting/product depth; P3 = authorized integrations; “Never” = prohibited design as stated.

## 4. Canonical target architecture

    Taxpayer (web/mobile; optional channel adapters)
                         |
    Firm Workspace (dashboard, client 360, assignments, review)
                         |
              KIMA shared service layer
    identity / memberships / engagements / rule packs /
    cases / documents / approvals / evidence / payments / audit
                         |
       authorized, observable integration adapters
            /           |             \
    accounting import   payment rails   government service directory
                                        (manual unless connector approved)

**Boundaries and ownership**

1. **Taxpayer-owned records** remain portable: one taxpayer can work with different firms; revoking a firm terminates its reach, not the taxpayer's evidence.
2. **Firm-scoped records** such as staffing, assignments, client billing and draft work belong to a specific organization.
3. **Regulatory material** is jurisdiction-, effective-date- and provenance-specific; it cannot be silently activated by a UI preference.
4. **External adapters** are optional, individually enabled and never implicit prerequisites for KIMA's core workflow.
5. **Client-facing status** is a controlled projection of verified work; it is not an alias for the staff's internal stage.

The current engine already deliberately separates work stage, filing acknowledgment, tax payment and service-fee payment. Preserve those boundaries and add any new status only through the canonical transition code plus migration and tests.

## 5. Database crosswalk — do **not** run the submitted SQL

| External draft table | KIMA source of truth | Required change, if any |
|---|---|---|
| `firms` | `organizations` + `firm_members` | Country and branch filters; verify multitenancy, no parallel firm table |
| `users` | Supabase Auth plus existing member/contact bindings | No replacement login table, no client-controlled role strings |
| `clients` | `taxpayers`, versioned tax profiles and `engagements` | NIU scoped to verified jurisdiction/identity; never one firm's exclusive child |
| `government_credentials` | **No live default-equivalent approved** | Future restricted connector configuration and external secret vault, if authorized |
| `tax_obligations` | Verified tax rules, periods, `compliance_cases` / obligation design | Keep four axes and source provenance; statuses separate |
| `task_pipeline` | Case tasks, assignments and events | Add only missing assignment and recurrence features |
| `tax_documents` | `documents` / storage / versions / evidence | Add provenance, immutable versions, quarantine, retention controls |
| `tax_payments` | Tax-payment evidence/incident domain; **not** `service_payments` | Introduce only when schema audit confirms missing canonical representation |

**Candidate additive entities, after schema diff:** `integration_connectors` (provider/country/capability/authorization), `integration_jobs` (idempotency/attempts/outcome), `government_service_catalog` (service validity and canonical URLs), `integration_events` (sanitized request/response evidence), `certificate_validity` or equivalent metadata, `notification_deliveries`, and `accounting_import_profiles` where no canonical equivalents exist. These are **candidates**, not approved table names or runnable migrations.

**Mandatory database safeguards**: UUID ownership and RLS; explicit engagement/assignment checks on every read and write; append-only review and status history; encrypted object storage; revocation tested mid-session; actor and consent record; no cascade-delete of statutory evidence; whole-XAF amounts and UTC timestamps; idempotent submissions; unique keys scoped to the correct jurisdiction; check constraints rather than UI-only rules.

**Reconciliation issue to resolve before adding review actions:** the original ERD describes independent reviewer approvals, while `README.md` documents a narrow, disclosed self-approval constraint. Actual enforced behavior, qualified reviewer rules, and the owner's current exception policy must be reconciled in a specific engineering decision; do not silently treat the design text as the database contract.

## 6. Senior-accountant UX specification

### Global shell
Header: firm selector; firm-authorized client/NIU search; reporting period; jurisdiction and period type; notifications; current actor/role; FR/EN. Left navigation: Dashboard, Clients, Work queue, Deadlines, Documents, DSF, Messages, Firm billing, Evidence, Settings. Display “Government connections” only when there is a real manual/connector workflow to show.

### Zone 1 — portfolio KPIs
- **Due soon:** only source-verified due dates; provisional deadlines shown separately and labeled.
- **Awaiting review:** drafts with accepted evidence and required reviewer authorization.
- **Blocked/exception:** missing information, variance, expired consent, pending filing confirmation, payment dispute.
- **Evidence complete:** verified submitted items with provenance. Denominator and period visible.

Never substitute sample figures (142, 28, 89%) for production counts. Each KPI must drill into the same filtered queue and include last-updated/unknown states.

### Zone 2 — primary work surface
Desktop default: high-density table; optional Kanban over the *same* server-provided case IDs. Columns: taxpayer + masked NIU, tax type, period, due date and source, preparation state, review state, filing acknowledgment, tax-payment evidence, assignee, one permitted next action. Filters are persistent and accessible. A case with no verified rule shows “Deadline unverified”, not a fabricated countdown.

### Zone 3 — safe bulk work
Allow reminders, document requests, work assignment and CSV export after row-by-row authorization. Require confirmation and aggregate result reporting. No “approve all”, “submit all”, or “generate official ACF” buttons. Partial failures must not change unaffected records.

### Zone 4 — integration status
Default “Manual process / Not connected”; if technical monitoring is approved, show endpoint/capability, checked-at timestamp, authenticated source, latency or failures with confidence, and last successful audited operation. Never show hard-coded “Online” or pretend a system-wide page check equals an approved government connection.

### Review drawer
Left: versioned source documents, authenticity/provenance and three accounting/deductibility/VAT verdicts. Right: journal/DSF mapped figures, variance explanation, formula lineage, verified rule citations. Footer: blocking findings, review assignment, approval scope and snapshot hash. Action **Approve reviewed version** is separate from **Authorize external submission**; approvals are rejected if evidence changes, permissions lapse, reviewer conflicts exist, or another action already consumed the version. Optimistic locks, single-flight guards and server-side idempotency protect rapid double-taps.

**Accessibility/mobile:** 4.5:1 text contrast; visible 3px focus; 44px touch controls; no emoji status icons; respect reduced motion; test both locales at 375/768/1024/1440 px. On mobile, review is sequential panels rather than cramped side-by-side columns.

## 7. Legal and operational adjustments

- **Deadlines:** there is no universal `15th` rule. Taxpayer type, tax regime, tax center and accounting framework are separate axes. Every obligation carries source, effective period, jurisdiction, certainty and prorogations. The tax regime labels `simplifié` and `impôt libératoire` are historical in the repository rules, not current selectable defaults.
- **ACF vs ANR:** the DGI describes ACF as the current certificate and ANR as its predecessor. Support historical ANR documents only as archived historical evidence. Capture issue/expiry dates, original document hash, verification reference/source, and renewal tasks; do not assert KIMA issues or harvests ACFs.
- **Portal evolution:** support a country/service catalog, not permanent references to “Harmon”, “Fiscalis”, “SIGINT” as interchangeable APIs. For each service verify official host, purpose, account/authentication, published API or lack thereof, accepted file format, legal mandate and change process.
- **E-invoicing and direct fiscalization:** the exact claim in the supplied brief (“Section M 8e”, instant transaction reporting) is **unverified here**. Do not implement or market it without primary legal text, scope, date, consent and technical specification.
- **Offline-first:** cached drafts, resumable uploads and queue state are useful; an offline “submitted” action is only a local intention. Device loss, duplicate retry, expired OTP, conflict and missed deadline need explicit handling. No local cache of DGI passwords.
- **Payment truth:** `initiated` → `debit observed` → `government confirmed` is not one boolean. An MTN/Orange transaction may pay a service bill or transfer value without producing a government-confirmed tax quittance. Preserve receipt matching and dispute history.

## 8. Security and data protection release gates

| Threat | Control and negative test |
|---|---|
| Firm A searches Firm B's NIU or hash | Server derives tenant and active engagement; unauthorized search returns no data |
| Engagement revoked while tab remains open | Revalidate on resume and every mutation; clear old preview; do not reset the same user's data on ordinary token refresh |
| Reviewer opens an unassigned client's declaration | Assignment-scoped access, no global reviewer document browsing |
| Taxpayer forges `filed`, `paid` or `verified` | Database transition guards and sourced evidence requirements |
| Single click approves stale or changed version | Review snapshot hash, optimistic lock, qualified reviewer and idempotency key |
| Bulk action across several tenant rows | Per-record authorization and fail-closed partial outcomes |
| Government portal down, OTP expired or response ambiguous | State is attempted/unknown, not accepted; retry only under validated contract |
| Sensitive documents via WhatsApp or device cache | Consent/opt-in, malware scan, sender verification, encryption, retention, deletion and audit |
| Payment provider callback forged or replayed | Signed callback verification, amount/reference reconciliation, idempotent processing |
| Production sample/demo counts shown as real | Synthetic-data watermark; no unsupported “live” markers or government partnership claims |

Follow `AGENTS.md` for the Agent A/B division, evidence tests and owner gates. The 29 October QA plan explicitly barred real taxpayer data pending security and full journey completion. This report **does not certify the blockers resolved**. In particular, current open Phase 3/4 PRs and the earlier reported session-reset defect must be tested rather than assumed fixed.

## 9. Delivery plan: smallest coherent changes

| Wave | Engineering delivery | Exit criteria |
|---|---|---|
| **W0 — Integrity and release readiness** | Finish Phase 3/4 invitation/account-switch fixes, PR #140 concurrency flow, session refresh without false resets, Phase 5 document path, Phase 7 cross-tenant/security/journey checks | Two-firm negative tests; revoked-access tests; read/write/read-back; FR/EN E2E; no unauthorized evidence approval; stable auth refresh |
| **W1 — Senior review workspace** | Firm-filtered KPI queries, saved table/board filters, review queue, side-by-side drawer, safe bulk requests/assignments, case events | No fake data; review controls enforce permissions and immutable snapshot; accessibility passes |
| **W2 — Compliance and DSF value** | Verified rules + provisional countdown, normalized Sage/Excel import, OHADA root mapping, deterministic validations, ACF expiry tracker, official workbook preparation | Every number traces to source; no unverified obligation; official workbook samples checked by accountant |
| **W3 — Client collaboration** | Consent-based message/document channels and notifications, resumable uploads, evidence collection and signed documents | User confirms identity and opt-in; duplicate file handling and malware scan; failed deliveries visible |
| **W4 — Validated external adapters** | Provider-by-provider pilots for accounting, payment, portal verification; authorized filing only last | Written authorization/API contract; secure secrets; replay protection; audit; partner sandbox; independent compliance approval |
| **W5 — Wider CEMAC rule packs** | Country-specific obligations, tax centers, ACF equivalents, templates and providers | Per-country expert-reviewed law, dates, workflows and country-specific test corpus |

**Change-control rule:** each wave is broken into small branches/PRs based on up-to-date `main`. No parallel SQL model, no bypassing RLS, no untested migration on production, no merged feature simply because its UI renders.

### Suggested ownership
- **Agent A (data/security):** query contracts, RLS, approval/filing/payment state machines, cryptographic evidence, schema diffs, tests, external-adapter authorization.
- **Agent B (product/UI):** dashboard, review drawer, FR/EN, mobile/offline user experience, task queue, accessible status presentation.
- **Chief of staff:** PR sequencing and CI/QA evidence; no code.
- **Owner:** approve product scope, connector partnerships, release gates and any exception to independent review.

## 10. Acceptance criteria and measurable targets

**Evidence-based readiness:** one application -> valid firm/taxpayer engagement -> document request -> authorized upload -> three-verdict review -> declaration preparation -> separate professional review -> recorded government outcome -> verified archive; direct SQL tampering and second-firm reads must fail. Tests run through the actual authenticated UI and server paths, not only pure engine functions.

**Dashboard correctness:** each KPI reconciles to the filtered records; status labels derive from the canonical engine; no “Online” without checked source; partial back-end failures present error states rather than zero; no cross-firm counts.

**Import correctness:** originals never overwritten; six-column source layouts are discovered from real anonymized exports, not assumed; N and N-1 support, 4-to-1-digit longest OHADA root matching, unmapped accounts blocked for manual resolution; export into the correct official workbook.

**Pilot KPIs (collect baseline first):** median minutes per monthly return segmented into collection/preparation/review/submission evidence; percentage of document requests satisfied without manual chasing; verified filing evidence coverage; overdue actions; dispute-resolution time; dashboard task completion; willingness to pay. Treat “5–8 days to 45 minutes” and “89% captured” as **hypotheses**, not promised performance or measured baseline.

## 11. What specifically will **not** change

1. Brand stays **KIMA CONSULTING / KIMA OS**, with existing EN/FR taglines and owner-approved design tokens.
2. Existing Next.js 14, TypeScript and Supabase architecture remains the base.
3. Taxpayers retain their files; engagement grants are revocable and do not imply ownership by a firm.
4. Filing, tax payment and KIMA/firm fee payment remain independently evidenced.
5. No tax rule activates without authoritative legal provenance.
6. No AI output, offline queue or UI click constitutes official filing or tax assessment.
7. No claimed DGI affiliation, integration or authorization.
8. No real taxpayer records before applicable security, privacy and end-to-end release gates pass.

## 12. README amendment and proposed decisions

The README should link to **this dated report** prominently in the Architecture section and use an explicit “Retain / Modify / Defer / Reject” summary. It should say which infrastructure actually exists, which screens are prototype or incomplete, and which integrations are only aspirations. Its historic 29 October status section can remain marked as dated, but it should not be used as a current deployment certification.

**For owner review:**

- **D-1:** Adopt this as the *roadmap interpretation* of the three November 2 briefs, not a replacement for Blueprint v1.0.
- **D-2:** Authorize Wave W0 security/journey completion as the prerequisite to new dashboard data wiring.
- **D-3:** Approve senior review dashboard implementation in an isolated PR only after Agent A issues a permission and data contract.
- **D-4:** Treat government filing, e-invoicing relay and receipt-harvesting integrations as blocked until legal and technical evidence is on record.
- **D-5:** Decide the precise professional-reviewer independence rule before finalizing the approval UI, since design and some implemented constraints differ.

**Documentation change status:** this report and the README link are documentation, not a change to app, SQL, CI, deployment or product availability.
