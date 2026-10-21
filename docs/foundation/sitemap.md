# Application Sitemap

Blueprint deliverable **C**. Source: `docs/blueprint/kima-compliance-os-blueprint-v1.0.md` §7, §9, §10.

Every route is locale-prefixed `/{fr|en}/...`. French and English have full parity on
every core journey (Scenario I); `fr` is the default for Cameroon. Locale is persisted on
the user record, not inferred per request.

Four surfaces, four trust boundaries: **public**, **taxpayer** (`/app`),
**firm** (`/workspace`), **platform** (`/admin`). Nothing crosses a boundary by URL.

## 1. Public site — unauthenticated

| Route | Purpose | Notes |
|---|---|---|
| `/` | Hero, proposition, "Understand your taxes. Organize your records. Stay ready." | §8 Stage 1 |
| `/product` | What Compliance OS does, the six areas | |
| `/for-taxpayers` | Taxpayer journey | Segments A, B |
| `/for-accountants` | Firm journey | Segment C |
| `/services` | Professional service packages, transparent scope **and exclusions** | §15 Stream A |
| `/trust` | Security, confidentiality, data protection posture | No unverified claims |
| `/resources` · `/resources/[slug]` | Tax education, plain-language explainers | Each cites a source + verified date |
| `/demo` | Demonstration / consultation request | Lead capture, P0 item 1 |
| `/contact` | Inquiry form | |
| `/legal/privacy` · `/legal/terms` · `/legal/data-processing` | Legal | Gated on the Law 2024/017 review |

> Claims about DGI authorization, partnership or e-filing are **forbidden** on every public
> page until written verification exists (§14).

## 2. Authentication

| Route | Purpose |
|---|---|
| `/login` | Email + password, then MFA when enrolled |
| `/signup` | Taxpayer self-registration |
| `/signup/firm` | Accounting firm registration (manual review before activation) |
| `/forgot-password` · `/reset-password/[token]` | Recovery |
| `/verify-email/[token]` | Email confirmation |
| `/mfa/enrol` · `/mfa/challenge` | TOTP. **Mandatory** for every privileged role (§14) |
| `/invitations/[token]` | Accept firm-staff or taxpayer-delegate invitation |
| `/engagements/[token]/authorize` | **Taxpayer authorizes a firm to access their workspace.** Separate, explicit, revocable — ownership is not engagement |

## 3. Taxpayer portal — `/app`

Plain language, low density, mobile-first, usable on a slow connection (Scenario J).

| Route | Purpose |
|---|---|
| `/app` | Personalized home: **the single next required action**, then documents missing, upcoming obligations, recent activity |
| `/app/onboarding` | Guided assessment; flags anything needing professional validation (§8 Stage 2) |
| `/app/documents` | All documents, received and missing |
| `/app/documents/requests/[id]` | One request: what is needed, why, upload by camera or file |
| `/app/documents/[id]` | A document and its version history |
| `/app/obligations` | My obligations and deadlines, in plain language |
| `/app/declarations` · `/app/declarations/[id]` | Progress timeline using the **client-visible** state only |
| `/app/messages` · `/app/messages/[threadId]` | Private messaging with the assigned accountant |
| `/app/invoices` · `/app/invoices/[id]` | Kima service charges and payment history |
| `/app/archive` | Year-by-year Evidence Vault: declarations, acknowledgments, receipts, certificates |
| `/app/learn` | Tax education centre |
| `/app/profile` | Taxpayer profile and tax profile (read-mostly; changes flagged for professional review) |
| `/app/settings/{notifications,language,security,consent}` | Channel opt-in, locale, MFA, consent records |
| `/app/assistant` | Kima Clarity AI, scoped to **this taxpayer's own records only** |

## 4. Firm workspace — `/workspace`

Data-dense, desktop-first, keyboard-driven.

| Route | Purpose |
|---|---|
| `/workspace` | Portfolio dashboard: deadlines at risk, pending requests, review queue, workload |
| `/workspace/clients` | Multi-client list with completeness and risk indicators |
| `/workspace/clients/[taxpayerId]` | Client workspace shell |
| `  ├ /overview` | Profile, engagement, assigned staff |
| `  ├ /documents` | Documents, requests, missing items, responsible party |
| `  ├ /periods` | Accounting periods |
| `  ├ /declarations` | Declaration records for this client |
| `  ├ /tasks` · `/messages` · `/payments` | Work, communication, billing |
| `  └ /audit` | Access and change history for this client |
| `/workspace/queue` | Document review queue across clients — classify, accept, reject, request again |
| `/workspace/deadlines` | Compliance calendar, filing preparation windows, escalations |
| `/workspace/declarations` · `/[id]` | Declaration workflow |
| `/workspace/declarations/[id]/review` | **Review gate.** Checklist + authorized reviewer; approval impossible otherwise (Scenario E) |
| `/workspace/declarations/[id]/evidence` | Submission evidence capture (Scenario F) |
| `/workspace/dsf/[preparationId]` | DSF Bridge shell |
| `  ├ /sources` | Uploaded Sage/Excel files, originals preserved |
| `  ├ /mapping` | Account-to-field mapping, ambiguities resolved by a human |
| `  ├ /validation` | Deterministic findings, unresolved issues |
| `  ├ /summary` | Each value with its origin and derivation |
| `  └ /export` | Approval and export of the preparation file |
| `/workspace/corrections` · `/[id]` | Correction cases, correspondence, resolution (Scenario G) |
| `/workspace/tasks` · `/workspace/messages` | Firm-wide work and communication |
| `/workspace/billing/{quotes,invoices}` | Service quotations and invoices |
| `/workspace/reports` | Productivity, bottlenecks, completion rates |
| `/workspace/knowledge` · `/knowledge/[ruleId]` | Compliance knowledge centre: rule, legal source, effective date, last verified, historical versions |
| `/workspace/team` | Staff, roles, assignment |
| `/workspace/settings` | Firm profile, branding, notification policy |
| `/workspace/assistant` | Clarity AI over authorized clients only |

## 5. Platform admin — `/admin`

Kima staff only. Separate from firm roles; a firm owner is not a platform admin.

| Route | Purpose |
|---|---|
| `/admin` | Operational overview |
| `/admin/organizations` · `/[id]` | Firms, activation, suspension |
| `/admin/users` · `/[id]` | Accounts, role grants, MFA resets |
| `/admin/sources` · `/[id]` | Regulatory source library (legislation, circulars, OHADA, guides) |
| `/admin/rules` · `/[id]` | Tax rule authoring and **versioning** |
| `/admin/rules/[id]/review` | Qualified-reviewer verification. **Unverified rules cannot activate** |
| `/admin/audit` | Platform-wide immutable audit search |
| `/admin/jobs` | Background work: imports, notifications, reminders |
| `/admin/flags` | Feature flags, including per-country enablement |

## 6. Cross-cutting

- **PWA**: installable, offline shell, **queued and resumable uploads** — a photographed
  receipt must survive a dropped connection. Architectural, not polish (§1, §9).
- **Empty, loading and error states are first-class** on every route (§20 rule 8).
- **Status honesty**: every surface visibly distinguishes confirmed information, draft
  calculation, estimated risk, and work awaiting review (§9).
- **No `/api/*` route trusts the client for tenancy.** Scope is derived server-side from
  session plus membership plus engagement, never from a request parameter.
