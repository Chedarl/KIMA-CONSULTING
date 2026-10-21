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
| R-24 | Clients will not leave WhatsApp for a portal | **H** | **H** | Decide WhatsApp-in viability in Phase 0; design onboarding assuming resistance; measure document-collection time against the pre-Kima baseline | Product | **Blocking Phase 4 design** |
| R-25 | Real Sage exports differ from assumptions | **H** | M | Five to ten real anonymised workbooks before the DSF Bridge is designed; manual mapping resolution is a first-class feature, not a fallback | Product | **Blocking Phase 6** |
| R-26 | No qualified tax reviewer available | M | **H** | Radar and rules ship inactive rather than unverified; Phases 3 to 5 do not depend on the reviewer | Founder | **Blocking Phase 7** |
| R-27 | Firms reject client visibility | M | M | Coarse client status; the firm controls the mapping; pilot interviews test it early | Product | Open |
| R-28 | Scope creeps back to all eighteen "Priority 0" items | **H** | M | Thin vertical slice; billing, education centre and rules engine explicitly deferred; each phase ends in a demonstrable deliverable | Product | Open |
| R-29 | Building for Kima's own practice and calling it a product | M | M | Three to five external firms in the pilot from the start, not only Kima's team | Founder | Open |
| R-30 | Low-bandwidth mobile upload fails in the field | **H** | M | Queued, resumable uploads designed in from Phase 4; tested on a throttled connection (Scenario J), not on office wifi | Eng lead | Open |
| R-31 | The local development environment cannot run the stack | M | L | One Next.js application plus Postgres plus one worker; no four-process local stack on a 16 GB machine with little free memory | Eng lead | Open |
| R-32 | The pilot runs on real taxpayer data before consent and privacy work is done | M | **H** | Clearly-labelled synthetic data in development and staging; real data only after R-06 clears | Founder | Open |

## Phase gates

A phase does not close while a **blocking** item against it remains open.

| Gate | Must be clear |
|---|---|
| Phase 0 to 1 | R-05 and R-08 decided; R-06 under way; R-24 and R-25 answered |
| Phase 3 to 4 | R-09, R-10, R-15 proven by passing negative tests |
| Phase 4 to 5 | R-30 tested on a throttled connection; R-32 confirmed synthetic-only |
| Phase 6 start | R-25 closed — real workbooks in hand |
| Phase 7 start | R-26 closed — reviewer named |
| Milestone 5 | R-06, R-07, R-17 closed; acceptance scenarios A to J all green; penetration test passed |
