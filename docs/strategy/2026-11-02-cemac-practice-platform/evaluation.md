# Evaluation — TaxDome/CEMAC proposal, 2 November 2026

**Author:** Agent C (DeepSeek Harness session), at the owner's request.
**Status:** proposal. Nothing here is approved. No SQL in this document has been applied.
**Inputs:** the owner's 2 Nov brief (TaxDome analysis, "CEMAC TaxFlow" modules, a
greenfield PostgreSQL schema, a four-zone dashboard spec); `CLAUDE.md`;
`docs/foundation/harmony2-dgi-platform-research.md`; `docs/audits/2026-10-27-taxdome-parity/`.

---

## 0. Verdict in one paragraph

The brief is directionally right about the market and **wrong in one decisive place**.
The commercial thesis — government portals collect revenue, they do not run a firm's
back office, so the operational layer is the product — is the same conclusion this
repository reached on 27 October and has been building against since. But the
proposed "Government Portal Bridge & Middleware", with a `government_credentials`
table holding each client's DGI username and password and a service that
"auto-submits the moment the government API stabilises", is **explicitly prohibited
by our own foundation research**, and the proposed schema would fork the data model
we have spent six weeks hardening. What survives the review is narrower and more
valuable: an acknowledgement log, a notification outbox, an attestation register and
time tracking. Section 4 ranks them; section 5 gives the order.

---

## 1. What the brief gets right

1. **The category distinction is correct.** SIGINT, Fiscalis and Harmony 2 are
   revenue systems for the regulator. A practice management layer is an operations
   system for the firm. No amount of DGI digitisation removes the need to chase a
   client for a bank statement.
2. **The "last mile" argument is correct and is our existing thesis.** The state
   solved the filing channel (TADAT D4-14: D→A) and did not solve on-time filing
   (D4-12: C→C) or declared-accuracy verification (D6-19: C→D). The work happens in
   the taxpayer's and accountant's hands, where no government portal reaches.
3. **The operational friction list is accurate**: multi-portal fragmentation,
   deadline congestion, delayed *quittances*, and the audit-defence value of a
   complete archive. Those are the right problems.
4. **Mobile money and WhatsApp are the correct local rails.** Not Stripe, not email
   alone.

## 2. The four things the brief is wrong about

### 2.1 Storing DGI credentials — prohibited, not merely risky

`docs/foundation/harmony2-dgi-platform-research.md` §4, "Not permitted":

> Scripted login to Harmony 2 on a client's behalf. **Storing client DGI passwords.**
> Screen-scraping. Any UI that implies Kima transmits to the DGI. Any status reading
> "filed" that is not backed by an acknowledgment document. Describing Kima as
> integrated, connected or interfaced with the DGI.

The proposed `government_credentials(username_encrypted, password_encrypted,
last_synced_at)` table is that prohibition, in DDL. "Encrypted at rest" does not
change the ruling: the objection is custody and use, not the cipher. This is also the
single highest-severity asset we could ever hold — a credential that files tax
returns for a third party — and the product has no PITR and irreversible migrations
(`docs/deployment.md`). **Recommendation: do not build, at any phase, without a
written legal opinion and an owner decision that supersedes §4.**

### 2.2 "Auto-submitting when the portal stabilises" — also prohibited

Same section, same clause. There is no public Harmony 2 API and no evidence of
third-party programmatic access. An "offline draft queue that auto-submits" is an
integration claim in architectural form, and our constraint forbids representing an
integration as established. **What is permitted and still valuable** is a
*submission-attempt log*: the file is prepared, a human submits it, and we record
who, when, from which portal, with the acknowledgment document attached. That gives
offline preparation and audit defence without claiming transmission (§4.2).

### 2.3 Abolished regimes offered as current choices

The proposed `clients.tax_regime` comment reads "Simplifié, Réel, Impôt
Libératoire". `CLAUDE.md` is categorical: both the *impôt libératoire* and the
*régime simplifié* were abolished and replaced by the **IGS** under the 2025 Finance
Law; they may appear only for historical periods, via `effective_to` in
`lib/rules.ts`. A schema comment is not a runtime choice, but it is how the choice
gets reintroduced six months later. Not acceptable as written.

### 2.4 "15th of every month" as a universal deadline

`CLAUDE.md`: a statutory deadline is not a fixed date; the **tax centre** (DGE /
CIME / CDI) governs when the DSF is due, and ministerial prorogations under art. 16
LF 2025 are routine. "Monthly returns by the 15th" is right often enough to be
believed and wrong in mechanism — exactly the class of conflation
`practitioner-notes-2026-10-21.md` §3 was written to stop. Deadlines must resolve
through `lib/rules.ts` and must report whether they are statutory or prorogued.

Two smaller errors, recorded because they propagate: the platform is **Harmony 2**,
not "Harmon"; and **tax regime is not the accounting framework** (SYSCOHADA normal
vs SMT) — the proposed schema has one free-text column for the first and none for
the second.

## 3. The proposed schema, mapped onto what exists

The proposal is greenfield. Ours is not, and the differences are the hardening of
six weeks of security work: RLS on 31/31 tables, 76 policies, append-only
`case_events`, evidence-gated filing, separation of duties, 87 forward-only
migrations.

| Proposed | Exists as | Do not fork because |
|---|---|---|
| `firms` | `organizations` (`kind='firm'`) | carries verification, suspension, directory, RLS scoping |
| `users` (+ firm_id, role enum incl. CLIENT_ACCESS) | `firm_members` ⟂ `contacts` ⟂ `auth.users` | a firm member and a client are *different* identities; `auth_identity_is_single` enforces it. The proposed single table collapses the tenant boundary |
| `clients` | `taxpayers` + `contacts` + `contact_account_links` | many-to-many people↔files is the CRM model already decided |
| `government_credentials` | — | **prohibited**, §2.1 |
| `tax_obligations` | `compliance_cases` (obligation × taxpayer × period) | the case is the spine; obligations are *generated* from verified rules, not configured |
| `task_pipeline` | `case_tasks` + case stage | stage moves are gated by `advance()` and `canApproveReview()` |
| `tax_documents` | `documents` + `document_verdicts` + `document_requests` | three verdicts per document, storage scoped by taxpayer path |
| `tax_payments` | `service_payments` (our fees) — tax paid to the DGI is *evidence*, not money movement | we never touch the taxpayer's money; a payment is a fact to be evidenced |
| — | — | no `time_entries`, no `notifications`, no attestation register, no submission log |

Also rejected from the DDL: `NUMERIC(15,2)` money (the rule is integer XAF minor
units), `VARCHAR`-with-CHECK status enums where the product already has typed unions,
and **no RLS at all** — the single largest regression in the document.

## 4. What is genuinely new, and buildable

Ranked by value ÷ risk. Items 1 and 4 need no regulatory source; items 2 and 3 do.

| # | Item | Why it matters | Blocked on |
|---|---|---|---|
| 1 | **Submission-attempt log** (`filing_attempts`) — prepared → submitted by a named human → acknowledgement document → status | gives the audit defence and the "did it actually go?" answer the incident engine needs; implements idempotency keys that phase 6 already asks for | nothing |
| 2 | **Attestation register** (ACF, ANR, NIU) with expiry and evidence | the brief's best local insight: firms need ACFs for tenders and lose them silently | **a verified rule for validity duration** — the rule corpus has zero ACF entries today, so any auto-expiry we wrote would be invented |
| 3 | **Notification outbox** (email now; WhatsApp/SMS adapter later) with consent and delivery audit | reminders are the difference between a portal and a habit | provider + consent wording; no PII in logs |
| 4 | **Time tracking** (`time_entries`) | parity gap, pure practice management, zero regulatory content | nothing |
| 5 | **Multi-jurisdiction skeleton** (GA/TD/CG/GQ/CF selectors, empty packs) | the "one engine, six thin packs" architecture is already there | per-country rule corpus; empty packs deliver nothing on their own |
| 6 | Parent/child client grouping (branches) | real for multi-site clients | nothing, but low urgency |

## 5. Sequence I recommend

Each line is one PR, smallest first, and nothing merges that applies SQL to
production without the owner saying "apply this migration".

1. **This document.** Establishes the ruling and the map. No code. *Merge now.*
2. **Staging-first discipline.** Today preview deployments point at production and
   there is no staging practice; the seed I just ran proves staging works. Make
   "apply to staging, verify, then merge" the default and write it into
   `docs/deployment.md`. *No product code, high leverage.*
3. **Time tracking** (item 4) — smallest complete vertical slice, exercises the
   seven-step gate end to end.
4. **Submission-attempt log** (item 1) — the honest version of the brief's
   "offline queue", and the missing half of phase 6.
5. **Notification outbox** (item 3).
6. **Attestation register** (item 2) — *only after* a sourced ACF rule exists.

Explicitly **not** next: geographic expansion, e-signature (approval evidence
already exists as `case_client_approvals`), portal credentials (never), and the
four-zone dashboard's "real-time portal health monitor" — we have no telemetry from
Harmony 2 and a green dot we cannot substantiate is the exact kind of claim
`CLAUDE.md` forbids.

## 6. The uncomfortable comparison

The 27 Oct audit already said this, and it still holds: **TaxDome's features are not
our bottleneck.** No client has yet uploaded a file through the UI; firm self-sign-up
is still switched off; 1 of 14 rules is verified. A firm does not switch tools for a
Kanban board. It switches because a deadline did not slip and an ACF arrived on time.
Feature parity is a *retention* problem; the *acquisition* problem is the shared
document loop and the deadline that resolves correctly. The brief would have us build
the retention layer first.

## 7. Decisions needed

1. **Confirm the prohibition stands**: no client DGI credentials, no scripted login,
   no auto-submission. (If it is to be revisited, it needs a legal opinion, not an
   engineering decision.)
2. **Approve sequence 2–3** (staging discipline, then time tracking) so I can start
   merging this week.
3. **Name the ACF rule source** if one exists — otherwise item 2 stays a document
   type with a firm-declared expiry, not a computed legal status.
