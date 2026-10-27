# TaxDome versus KIMA — feature parity

*Agent A draft. **Agent B (Cursor) owns the product-parity conclusions**; this file is
to be reconciled with Agent B's before the final recommendation. KIMA status comes from
`implementation-readiness.md` (`main` @ `26d1ac7`). TaxDome capabilities are taken from
TaxDome's own help centre and product pages, read 27 Oct 2026 (sources at the end).*

## How to read the TaxDome column

- **Documented** = described in the TaxDome Help Center as a configured feature.
- **Advertised** = stated on a marketing page only.
- Nobody on this project has used a TaxDome account. **Every TaxDome row is therefore
  documentation, not verified behaviour.** Where marketing and help centre differ,
  the help centre is used.

## Matrix

Priority = what KIMA should do about the gap, P0 (now) to P3 (later), consistent with `prioritized-roadmap.md`.

| Module | TaxDome capability | KIMA implementation | KIMA status | Gap | Priority |
|---|---|---|---|---|---|
| **CRM** | Accounts containing contacts; tags on accounts, jobs and documents; custom fields; folder templates per account (Documented: Help 97) | Contacts ⟷ taxpayers with per-link access, derived segments, typed tags (`lib/crm.ts`); Client 360 | PROTOTYPE | No screen creates or edits contacts, links or tags; no custom fields | **P1** |
| **Client onboarding** | Organizers (structured intake), client requests, test accounts, portal invitations (Documented: Help 97, 193) | Public application `/register`; firm wizard creates a taxpayer + organizer answers; lead triage | PARTIAL | No conversion of an application into a client with portal access; no invitation; no organizer templates | **P1** (conversion is **P0** for Journey B) |
| **Client portal** | Documents, chats, tasks, invoices, signatures in one branded portal; web and mobile (Documented: Help 97, 167) | `/app/*`: dashboard, declarations, requests, documents, messages, calendar, payments, profile | PARTIAL | Upload BLOCKED; payments BLOCKED; profile save refused silently | **P0** |
| **Document management** | Folders with access levels; per-document permissions; sealing; approvals; lock document to invoice; link to job (Documented: Help 818) | Requests → upload → three verdicts; naming grammar (`document-naming.ts`) | BLOCKED (storage) / PARTIAL (review) | Storage policies; no folders in UI; no client approval; no versioning | **P0** storage, **P2** folders |
| **Workflow pipelines** | Pipelines → stages → jobs → tasks; job templates; assignees; kanban (Documented: Help 97) | One fixed case pipeline (7 stages) with gates, four status dimensions, separation of duties | PARTIAL | Cases cannot be created from the UI; no templates; tasks cannot be created; no kanban | **P1** |
| **Automation** | Stage automations (send invoice, organizer, signature request, message); recurring jobs daily…annually; auto-move (Documented: Help 97, 290) | None. `proposeCases()` computes what should exist, but nothing writes it | MISSING | Scheduler, reminders, recurring case generation from **verified** rules only | **P2** |
| **Communication** | Secure chats, email sync, SMS, reminders (Advertised: overview; chats Documented) | Secure messages with realtime; transactional email (OTP, contact form) | PARTIAL | Sender spoofable (P0); no email thread, no SMS or WhatsApp notification | **P0** fix, **P2** channels |
| **E-signatures** | Signature requests on returns and engagement letters; KBA (Documented: Help 97; KBA Advertised) | None | MISSING | Needs a legal basis for electronic signature in Cameroon before building — **unverified**, not assumed | **P3** |
| **Proposals / engagement letters** | Packaged proposals, client accept-and-sign, deposit; next job fires on signature (Documented: Help 97; Advertised: proposals page) | `engagements` with authorised / accepted / revoked timestamps; `authorityCheck`; quotation event kinds | PARTIAL | No proposal document, no client acceptance flow; the firm self-authorises (N-5) | **P1** |
| **Billing** | One-time and recurring invoices; TaxDome Payments / Stripe; lock documents to invoices; time tracking (Documented: Help 97, integrations) | Fee dimension on cases; client "report a payment"; firm confirm (open PR #6) | MISSING (issue) / BLOCKED (client report) | No invoice issuance; client report refused by the database; no payment provider (Mobile Money matters most for Cameroon) | **P1** |
| **Team management** | Owner / admin / employee; access rights per feature; assigned accounts; capacity (Documented: Help 601, 193) | 4 roles + capability matrix mirrored in SQL; separation of duties; admin has no professional authority | PARTIAL | No invite or deactivate screen; **no organisation scope**; no workload view | **P1** (scope is **P0** before a second firm) |
| **Reporting** | Prebuilt dashboards (revenue, time, capacity), report designer, AI queries, exports (Documented: Help 1339) | Firm dashboard with counts, risk and registration KPIs | PARTIAL | No reports, exports or overdue-work report | **P2** |
| **Integrations** | QuickBooks Online, DATEV, Stripe, Calendly, Zapier, IRS transcripts (Documented: integrations article) | Resend only. **No DGI integration, deliberately** (CLAUDE.md) | MISSING | Local accounting-software export (e.g. Sage, per `sage-dsf-ingestion-research.md`), Mobile Money — research first | **P3** |
| **Mobile** | Native client app, document scanner to PDF, white-label app (Documented: Help 167, 139) | Responsive web, 375 px checked, mobile nav | PARTIAL | No camera capture, offline or slow-network budget | **P2** (capture is P1 for incident evidence) |
| **Security** | SOC 2 Type II, GDPR, 2FA (Advertised: overview); access rights (Documented) | RLS everywhere through `can_see_taxpayer()`; OTP sign-in; append-only log | BLOCKED in places | Storage, event forgery, OTP flaws (see `security-and-integrity-review.md`). No certification claims should be made | **P0** |
| **Compliance (tax obligations, evidence, deadlines)** | US-centric tax-prep workflow, extensions, IRS transcripts (Documented: Help 920) — **no Cameroon content** | Cameroon rule registry with source status; prorogations; evidence-gated filing; three verdicts; professional review | PARTIAL | Only 1 of 14 Cameroon rules verified; no IGS obligation active | **P2** content (P1-9 official-text register) |
| **Incident recovery** | **Not documented** in any source read | Designed: `docs/strategy/2026-10-27-taxpayer-first/` | PLANNED | Entire module | **P2** per brief (the owner's first milestone pulls part of it forward — see roadmap) |

## Where KIMA is genuinely different (not a gap)

| KIMA capability | TaxDome equivalent found |
|---|---|
| Obligations generated only from **verified** official sources, with the source status shown | None found |
| Filing status gated on evidence; four (soon five) status dimensions never collapsed into one badge | None found; TaxDome tracks job stages |
| Three verdicts per document (accounting, deductibility, VAT recovery) | Document approval only |
| Separation of duties with disclosed self-approval | Access rights; no separation of duties found |
| Taxpayer self-reporting of incidents with a reviewer-only verification | None found |
| French / English, Cameroon tax centres, CEMAC rule packs | Multi-language portal advertised; no CEMAC content |

These are positioning hypotheses until the comprehension test
(`docs/strategy/2026-10-27-taxpayer-first/test-protocol.md` §4) runs with real taxpayers.

## Sources (TaxDome, read 27 Oct 2026)

- Help 97 — What you can do in TaxDome: https://help.taxdome.com/article/97-your-first-week-with-taxdome
- Help 290 — Add job recurrences: https://help.taxdome.com/article/290-adding-recurring-jobs
- Help 818 — Documents overview: https://help.taxdome.com/article/818-how-docs-work
- Help 139 — Upload documents (mobile scanner): https://help.taxdome.com/article/139-uploading-documents
- Help 167 — Client mobile app: https://help.taxdome.com/article/167-the-taxdome-mobile-app-for-android-and-ios
- Help 193 — Employee access rights: https://help.taxdome.com/article/193-team-member-access-rights
- Help 601 — System roles: https://help.taxdome.com/article/601-team-basic-owner-admin-employee-roles
- Help 1339 — Reporting explained: https://help.taxdome.com/article/1339-reporting-basic-overview
- Help — Integrations: https://help.taxdome.com/article/taxdome-integrations
- Help 920 — Tax preparation processes: https://help.taxdome.com/article/920-tax-preparation-configure-processes-in-taxdome
- Product overview (marketing): https://taxdome.com/overview
- Proposals and engagement letters (marketing): https://taxdome.com/proposals-engagement-letters
