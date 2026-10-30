# Compliance and Security Risk Register

Blueprint deliverable **I**. Source: §13, §14, §18, §20. Reviewed at the end of every phase.

Likelihood and impact: **L**ow, **M**edium, **H**igh. "Owner" is a role, not a person —
assign names before Phase 3.

## Regulatory and legal

| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-01 | A tax rule is wrong or out of date and a client relies on it | M | **H** | Rules are versioned data with a legal source, effective date and verification status. Only a platform reviewer activates. Unverified rules never surface an obligation | Tax reviewer | Open |
| R-02 | The product implies DGI authorization, partnership or e-filing it does not have | M | **H** | Prohibited-claim list in `CLAUDE.md`; public copy reviewed before publication; no integration claim without written verification | Founder | Open |
| R-03 | `tax_regime` is conflated with the DSF accounting format, producing the wrong return | **H** | **H** | Separate columns and separate validation; DSF template selected from `accounting_framework`; applicability established per taxpayer, never assumed | Tax reviewer + Eng | Open |
| R-04 | A filing obligation is inferred from turnover alone | M | **H** | Forbidden in rule evaluation; obligations require a verified rule plus the taxpayer's official profile | Tax reviewer | Open |
| R-05 | Kima is not authorized to represent taxpayers or prepare certain filings | M | **H** | Professional authorization confirmed in legal review **before** the pilot takes real client work | Founder + counsel | **Blocking Phase 0** |
| R-06 | Law 2024/017 obligations unmet when real taxpayer data enters the system | M | **H** | Data-protection review started in Phase 0; consent records, retention and deletion policy designed before Phase 4 | Founder + counsel | **Blocking pilot** |
| R-07 | Record-retention duties conflict with deletion requests | M | M | Retention schedule per record class; legal basis documented; immutable evidence separated from erasable personal data | Counsel | Open |
| R-08 | Cross-border transfer restrictions breached by the hosting choice | M | **H** | Residency decided in Phase 0 alongside the privacy review | Founder | **Blocking Phase 3** |

## Security

| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-09 | Cross-tenant exposure — Firm A reads Firm B | M | **H** | Postgres RLS on every tenant table; scope derived server-side only; **automated negative tests in CI from the first schema commit**; RLS verified with the application's own database role, not a superuser | Eng lead | Open |
| R-10 | A taxpayer reads another taxpayer's file by guessed id or direct URL | M | **H** | UUID keys, no sequential ids in URLs, authorization on every object fetch, signed short-lived storage URLs | Eng lead | Open |
| R-11 | Document storage directly reachable | L | **H** | Private bucket, no public objects, short-lived signed URLs, access logged | Eng lead | Open |
| R-12 | Malicious upload — malware or a crafted PDF/XLSX | **H** | M | Antivirus scan and real content-type verification before a file becomes readable; parsing sandboxed and resource-limited; originals never executed | Eng lead | Open |
| R-13 | Prompt injection through an uploaded document or client message reaches Clarity AI | **H** | **H** | Document content is **data, never instructions**; the assistant runs under the caller's scope with no write or approve authority; structured-output validation; tool allowlist | Eng lead | Open |
| R-14 | Privileged account compromise | M | **H** | Mandatory MFA for firm owner, firm reviewer and all platform roles; least privilege; session and device review; support reads audited and surfaced to the taxpayer | Eng lead | Open |
| R-15 | Audit trail tampered with or incomplete | L | **H** | `audit_events` append-only for every role, no update or delete grant; all material status changes recorded; periodic integrity check | Eng lead | Open |
| R-16 | Secrets leaked via repo, logs or client bundle | M | **H** | Secret manager, no secrets in the repo, log redaction, pre-commit secret scan | Eng lead | Open |
| R-17 | Backups never actually restored | M | **H** | A restore drill is a Milestone 5 gate, not a checkbox | Eng lead | Open |

## Product integrity

| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-18 | A declaration shows as filed without official evidence | M | **H** | `filed_at` is evidence-gated in the data layer; no role, including admin, can bypass it (Scenario F) | Eng lead | Open |
| R-19 | An import silently alters or invents a financial value | M | **H** | Originals preserved; every `dsf_field_value` carries its derivation; unmapped data surfaced, never defaulted; overrides require a reason (Scenario D) | Eng lead | Open |
| R-20 | Approval obtained without real review, or self-approved | **H** | **H** | Checklist plus authorized reviewer enforced in data; reviewer differs from preparer; approved snapshot immutable. **Any solo-firm exception must be explicit and recorded, never silent** | Tax reviewer | Open |
| R-21 | AI fabricates a legal requirement or a filing confirmation | M | **H** | Retrieval over approved sources only; citation with effective date required; refuse and escalate on uncertainty; never represents output as a DGI determination | Eng lead | Open |
| R-22 | Monetary rounding or currency errors | M | **H** | Integer minor units; **XAF treated as zero-decimal**; explicit scale column; no floating point anywhere in the money path | Eng lead | Open |
| R-23 | Client-visible status misleads about real progress | M | M | Explicit stored mapping between `internal_status` and `client_status`; taxpayer queries never read internal state | Product | Open |

## Adoption and delivery

| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-24 | Clients will not leave WhatsApp for a portal | **H** | **H** | **WhatsApp-in deferred by decision, 2026-10-20.** Intake is signed upload links as primary and email-in as secondary, both through a channel-agnostic intake queue so WhatsApp becomes an adapter later, not a schema change. Measure document-collection time against the pre-Kima baseline; if adoption stalls, this reopens | Product | Deferred — **monitor** |
| R-25 | Real Sage exports differ from assumptions | **H** | M | **Confirmed obtainable from the practitioner, 2026-10-20.** Research closed the format question negatively: there is no canonical Sage column order, so profile detection plus human confirmation is the design. Files become anonymised fixtures and regression tests. See `sage-dsf-ingestion-research.md` §4, §7 | Product | Open — **files requested** |
| R-26 | No qualified tax reviewer available | M | **H** | **Resolved in principle, 2026-10-20:** a reviewer **pool** replaces the single expert. Reviewers sign up directly with Kima, are credential-verified, and hold capability flags. Radar and rules still ship inactive until a reviewer with `can_verify_rules` exists | Founder | Mitigated — capacity still to build |
| R-33 | Taxpayer financial data shared with an external reviewer without a lawful basis | M | **H** | **[NEW] 2026-10-20, from the reviewer-pool decision.** Law 2024/017 basis and taxpayer notice established before the first external review; professional confidentiality undertaking signed at reviewer sign-up; access limited to the assigned declaration and audited into the taxpayer's own access history | Founder + counsel | **Blocking first external review** |
| R-34 | A pool reviewer is unqualified, conflicted, or rubber-stamps | M | **H** | **[NEW] 2026-10-20.** Credentials checked against the issuing body and the check recorded, never assumed; conflict declared before acceptance with a no-reason decline; capability flags default to off on sign-up; review turnaround and approval patterns monitored for rubber-stamping | Tax reviewer | Open |
| R-35 | Reviewer capacity becomes the bottleneck at deadline peaks | M | M | **[NEW] 2026-10-20.** Deadlines cluster by tax centre — 15 March, 15 April, 15 May — so demand is spiky by construction. `capacity_per_week` on the reviewer profile, assignment expiry and re-offer, and pool depth recruited against the March peak, not the average | Founder | Open |
| R-27 | Firms reject client visibility | M | M | Coarse client status; the firm controls the mapping; pilot interviews test it early | Product | Open |
| R-28 | Scope creeps back to all eighteen "Priority 0" items | **H** | M | Thin vertical slice; billing, education centre and rules engine explicitly deferred; each phase ends in a demonstrable deliverable | Product | Open |
| R-29 | Building for Kima's own practice and calling it a product | M | M | Three to five external firms in the pilot from the start, not only Kima's team | Founder | Open |
| R-30 | Low-bandwidth mobile upload fails in the field | **H** | M | Queued, resumable uploads designed in from Phase 4; tested on a throttled connection (Scenario J), not on office wifi | Eng lead | Open |
| R-31 | The local development environment cannot run the stack | M | L | One Next.js application plus Postgres plus one worker; no four-process local stack on a 16 GB machine with little free memory | Eng lead | Open |
| R-32 | The pilot runs on real taxpayer data before consent and privacy work is done | M | **H** | Clearly-labelled synthetic data in development and staging; real data only after R-06 clears | Founder | Open |
| R-36 | Portal sign-in uses the taxpayer number as the password, and the taxpayer number is not a secret | **H** | **H** | **[NEW] 2026-10-21, from the owner's sign-in request.** The NIU is printed on tax documents, is a mandatory mention on every invoice the client issues, and is the DGI's own Harmony 2 *username*. Anyone holding one of the client's invoices can sign in as them, which breaches tenant isolation directly. Shipped against synthetic data only and labelled as a demonstration in the interface itself. `portal_sign_in` returns identity fields only — never documents or declarations — and gives one message for both failure modes, so the form cannot be used to test whether a given business is our client. **Fix that keeps the owner's intent:** the NIU becomes the identifier and a one-time code to the onboarding contact address becomes the secret; the client still types and learns their number | Founder + Eng | **Blocking real taxpayer data** |
| R-37 | A regime abolished by the 2025 Finance Law is offered as a current choice | M | **H** | **[NEW] 2026-10-21.** The impôt libératoire and the régime simplifié were replaced by the IGS, and both were still selectable in the organizer. Regimes now carry `effective_from` / `effective_to` in `lib/rules.ts`, and `selectableRegimes()` excludes the abolished ones for a current period while keeping them available for historical work | Tax reviewer + Eng | Mitigated |
| R-38 | A statutory deadline is shown as fixed when a ministerial communiqué has moved it | **H** | M | **[NEW] 2026-10-21.** Prorogations are routine, not exceptional — the Minister may extend deadlines under art. 16 LF 2025 and does so most years. `Prorogation` is first-class data carrying its own communiqué reference; a resolved date always reports whether it is statutory or prorogued, and every DSF date returns `needsConfirmation`, because the three-date split rests on secondary commentary while the only citable official date is 15 March | Tax reviewer | Mitigated — needs the year's communiqué loaded |
| R-39 | Document acceptance is recorded as a single verdict, losing the accounting/tax distinction | M | M | **[NEW] 2026-10-21, from the practitioner session.** "A document might not be good for accounting but be recorded for taxation." Three independent verdicts — accounting, charge deductibility, VAT recovery — each with its own reasons and citations, in `lib/document-review.ts` and the `document_verdicts` table. A failed accounting verdict never discards the document | Tax reviewer + Eng | Mitigated |

## Taxpayer-first incidents (added 2026-10-27)

From the owner's taxpayer-first brief; analysis in
`docs/strategy/2026-10-27-taxpayer-first/security-and-sources.md`.

| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-40 | A tax payment is shown as paid on the strength of a debit, not an official receipt | M | **H** | Payment states keep debit observed, reference recorded, DGI receipt and disputed apart; `verified` requires reviewer + evidence, enforced by a CHECK. Today `payment_evidence_status` has **no** evidence CHECK | Eng lead + Tax reviewer | Open |
| R-41 | A DGI or Trésor outage, or a reconciliation failure, is presented to the taxpayer as their own error — or as resolved | M | **H** | Incident record keeps DGI-controlled steps separate; filing stays `attempted`; next action never claims an outcome | Eng lead | Open |
| R-42 | A KIMA case file is presented by a taxpayer as if it were an ACF | M | **H** | No seal, QR or "conforme"; fixed "not an ACF" line in both locales; link to the DGI service (carries the 22 Oct "Dossier fiscal" decision) | Founder | Open |
| R-43 | Escalation guidance paraphrases unverified commentary and is wrong | M | **H** | Guidance strings may cite only `verified` sources; otherwise a fixed "not yet confirmed" fallback | Tax reviewer | Open |
| R-44 | Incident evidence captures DGI credentials or one-time codes | M | **H** | KIMA never asks for DGI credentials; capture warning; code-shaped strings rejected in free text | Eng lead | Open |
| R-45 | A plain-language bulletin misstates the official text it summarises | M | **H** | Expert-comptable approves every bulletin; machine drafts never shown; each bulletin links the original and names the reviewer; bulletins inform, never create obligations | Reviewer (expert-comptable) | Open |
| R-46 | An official text changes or is withdrawn and the bulletin or rule built on it goes stale | M | **H** | Source register keeps URL, fetch date and `sha256`; a changed hash withdraws dependent bulletins and flags dependent rules for re-verification | Eng lead | Open |
| R-47 | A second accounting firm is onboarded before permissions are organisation-scoped, and its members read or confirm the first firm's taxpayers, invoices and fee payments | M | **H** | **[NEW] 2026-10-27, owner decision D7.** `member_has()` checks the role's capability, not the organisation, so every firm policy is tenant-wide across firms. **2026-10-29: proven in CI, not assumed** — the two-firm test returned `have: 1, want: 0` on every cross-tenant read, and the audit found the gap also covers ~40 write policies, so a member of one firm could update another's taxpayers and engagements, not merely read them. **Fix written, awaiting merge: PR #22, migration `20261029213000`**, with 29 pgTAP checks over taxpayers, cases, requests, documents, stored files, invoices, case tasks and the application queue, in both directions, reads and writes. The second round added what the first left untested: a draft engagement grants nothing (T-37), a firm still reads the draft it holds (T-38), `revoked_at` alone removes access at once (T-49), and claiming a public application can only put it in the claimer's own firm (T-46, T-47). Mitigation until it merges: firm sign-up stays hidden (`OPEN_WORKSPACE_KINDS`) and no second `organizations` row may hold members | Agent A + Founder | **Blocking a second firm** |
| R-48 | A KIMA admin who is a member of a firm reads that firm's client data, against product rule 7 | M | M | **[NEW] 2026-10-29, found while scoping the application queue.** `kima_admin` holds `case.view`, and the organisation scoping in `20261029213000` grants access through firm membership, so a `kima_admin` row in `firm_members` with an organisation reads that firm's taxpayers like any member. The migration excludes `kima_admin` from the unclaimed-application queue by name (`firm_member_has()`, test T-48), which is the only path that names no organisation, but it does not otherwise separate platform administration from client access. Rule 7 wants a KIMA admin to hold no automatic access at all. Needs an owner decision on what a KIMA admin is for, then either a membership kind that carries no client capabilities or removal of `case.view` from the role | Agent A + Founder | Open, needs an owner decision |
| R-49 | `portal_request_code()` was callable by `anon`, so anyone could reset any client's one-time code | M | **H** | **[NEW] 2026-10-29, Supabase security advisor plus a privilege audit.** The function is `SECURITY DEFINER`, writes `otp_hash` and `otp_expires_at` on a `portal_accounts` row matched by name and NIU, and PostgREST published it at `/rest/v1/rpc/portal_request_code` with EXECUTE held by `PUBLIC`. It returns only a masked destination, so it leaks nothing by itself, but it lets an unauthenticated caller invalidate a client's pending code repeatedly and locks the real client out of signing in. No application code has called it since the auth-codes Edge Function took over; `portal_issue_code()` is the live path and is service-role only. **Fix written, awaiting merge: migration `20261030020000`**, which moves it and ten other definer helpers into a `private` schema that PostgREST does not publish, so they have no route at all, and additionally revokes EXECUTE on this one because no policy, trigger or application code calls it. T-54 asserts the refusal by its qualified name. Revoking EXECUTE on the *others* is not available: Postgres checks it against the querying role inside a policy expression, so a revoke breaks every scoped read rather than closing an endpoint (proven in CI; see the migration header). Dropping this function outright needs owner approval and is proposed separately | Agent A | Fix written, not merged |

## Phase gates

A phase does not close while a **blocking** item against it remains open.

| Gate | Must be clear |
|---|---|
| Phase 0 to 1 | R-05 and R-08 decided; R-06 under way; R-24 and R-25 answered ✓ |
| Phase 3 to 4 | R-09, R-10, R-15 proven by passing negative tests, **including the reviewer-scope cases** |
| Phase 4 to 5 | R-30 tested on a throttled connection; R-32 confirmed synthetic-only |
| Any real taxpayer data | **R-36 closed** — the taxpayer number demoted to an identifier and a real second factor in place |
| First external review | **R-33 closed** — lawful basis, taxpayer notice and confidentiality undertaking in place |
| Phase 6 start | R-25 closed — real workbooks in hand and parsed into fixtures |
| Phase 7 start | A reviewer with `can_verify_rules` verified (R-26); R-34 controls live |
| Milestone 5 | R-06, R-07, R-17 closed; acceptance scenarios A to J all green; penetration test passed |
