# Firm and client dashboards vs TaxDome-class practice management

Date: 3 November 2026. Scope: the **firm dashboard** (`/workspace`) and the
**business/client dashboard** (`/app`), weighed against the accounting workflow
products a Cameroonian firm would otherwise buy — TaxDome, Karbon, Financial
Cents, Canopy, Jetpack Workflow — and against what the CEMAC / Cameroon system
actually requires.

Method: read our own screens and code (screenshots of both dashboards captured
3 Nov), inventory the peer workflow primitives from their public product pages
and an independent head-to-head review\*, then classify every peer primitive as
**ADOPT**, **ADAPT** or **REJECT** for this market. Nothing here changes a rule:
\`CLAUDE.md\` still forbids invented deadlines and claimed DGI integration.

\* Sources: taxdome.com/workflow, taxdome.com/overview, karbonhq.com/solution/workflow-automation,
jetpackworkflow.com, and Insightful Accountant's "TaxDome vs Canopy vs Financial
Cents" head-to-head (18 Jun 2026).

---

## 1. What we have today

### Firm dashboard — the honest inventory

| Block | What it shows | Where the number comes from |
|---|---|---|
| Session bar | member, role, capability count | live member row |
| KPI row | open cases · waiting on clients · awaiting review · blocked | derived from cases and requests |
| Mon travail prioritaire | client, service, state, next action, due date — risk-ordered | cases + requests |
| Échéances et blocages | per-taxpayer legal deadlines | rules engine |
| Activité récente | event feed with actor and client visibility | case events |

**What is deliberately absent:** trend arrows, revenue tiles, and any count that
is stored rather than derived. The dashboard is a *work* instrument, not a
reporting surface.

### Client dashboard — the honest inventory

| Block | What it shows |
|---|---|
| Greeting + live dot | who is signed in, whether the connection is live |
| KPI row | active services · items waiting on you · documents shared · overdue |
| Next action card | "nothing to send right now" or the outstanding request with an upload control |
| Vos services en cours | the services the firm opened |
| Declarations strip | "no declaration to track" until one exists |

---

## 2. The peer inventory, and the verdict for CEMAC

### 2.1 Firm-side primitives

| Peer primitive (TaxDome / Karbon / Financial Cents / Canopy) | What it does | Verdict | Why |
|---|---|---|---|
| **Jobs pipeline** — kanban of every job by service stage | the firm's whole workload in one board | **ADOPT** | We have per-case stages but no board across cases. A pipeline per service is the single biggest dashboard gap. |
| **Job templates** — a job = task list + due offsets + assignee roles | repeatable work | **ADAPT** | A free-form template would let a firm invent dates. Template must be an **obligation** (code + period generator + evidence requirements), resolved through \`lib/rules.ts\`. |
| **Recurring work scheduler** | auto-creates next period's job | **ADOPT with a constraint** | Recurrence is driven by obligation + period, and every due date reports statutory / prorogued / unconfirmed. Never "15th". |
| **Capacity / workload by person** | who is over-allocated this week | **ADOPT** | We have assignees and due dates, so this is derivation, not new data. |
| **Time tracking → realisation** | hours per job, billable vs actual | **ADAPT** | We have \`time_entries\`. Cameroonian firms often bill by forfait, so show **hours vs fee** rather than US-style billable-hour utilisation as the headline. |
| **Revenue operations** — invoiced, paid, outstanding, aging | money in one place | **ADOPT** | We have invoices + service payments; the dashboard shows none of it. For a firm, "who owes me" is a daily question. |
| **Automations** — when a client uploads → create task, notify, invoice | remove manual chasing | **ADAPT** | Adopt the *shapes* (upload → review task; due in N days → reminder; accepted → next stage), but every automation is logged and reversible, and **none may move filing/tax-payment to verified**. |
| **Client organizers / checklists** | grouped, reviewable document requests | **ADOPT** | We have flat requests. A grouped checklist (period + obligation) matches how a Cameroonian accountant chases a client. |
| **Email sync (Gmail/Outlook)** | every thread on the client record | **ADAPT** | Our clients live on WhatsApp, not email. Build the **conversation log per client** (already have messaging) and treat email as one channel of it, not the backbone. Do not claim WhatsApp Business integration until a provider is verified and consented. |
| **Client health / last contact** | who has gone quiet | **ADOPT** | Derivable from events + messages; high value, no new schema. |
| **Reviewer queue with aging** | what is waiting for review and how long | **ADOPT** | We have the approvals page and a count; the dashboard needs **aging** (oldest first) because that is the real risk. |
| **E-signature** | engagement letters, approvals | **ADAPT** | Cameroon needs engagement mandates with NIU / corporate identity fields, and our model already separates \`declared\` from \`verified\`. Signature confirms a declaration; it never verifies a filing. |
| **AI assistant over the firm's data** (Atlas) | summarise, draft, chase | **ADAPT** | We have Clarity with a stricter contract: answers only from verified sources, refuses otherwise. Keep it; do not adopt a "do it for you" agent that could invent a rule. |

### 2.2 Client-side primitives

| Peer primitive | What it does | Verdict | Why |
|---|---|---|---|
| **One action list** — everything the client must do, dated | answers "what now?" | **ADOPT** | Our card shows one next action; clients juggling VAT and DSF need the full list, dated. |
| **Organizer / grouped checklist** | "September VAT: 3 documents" | **ADOPT** | Same reason as the firm side, mirrored. |
| **Invoices + pay online** | pay from the portal | **ADAPT** | Card/ACH is not the market. Adapt to **mobile money (MTN MoMo / Orange Money) + bank transfer + cash receipt**, with the payment staying \`declared\` until the firm reconciles it. No payment provider is claimed until verified. |
| **E-signature of mandates** | consent to act | **ADOPT (adapted)** | With NIU and company identity fields; the signature records authorization, not filing. |
| **Declaration tracker** | "where is my DSF?" | **ADOPT** | We show a strip only when a declaration exists; it should always answer: prepared → submitted → proof → verified, with the evidence attached. |
| **Notification preferences (email/SMS/WhatsApp)** | reach the client where they are | **ADAPT** | Default to the channel the firm already uses (WhatsApp), with explicit consent and an auditable log. Email alone under-serves this segment. |
| **Profile / KYC upkeep** | keep NIU, régime, centre correct | **ADOPT — and we must lead here** | The four axes (type, régime, centre, référentiel) drive which obligations exist and when. A dashboard that does not ask the client to confirm them will produce wrong deadlines. |
| **Document vault with proofs** | receipts, quittances | **ADOPT** | We have the vault; the client dashboard should surface "your proofs" rather than hide it in a sub-page. |

---

## 3. What we must not copy

| Peer behaviour | Why it is wrong here |
|---|---|
| Free-form due dates on templates | \`CLAUDE.md\`: a statutory deadline is not a fixed date; prorogations are routine. Dates come from the rules engine, with their status stated. |
| "E-filed" / "submitted to the tax authority" badges | No DGI integration is claimed or established. Filing requires official evidence, recorded by a human. |
| Auto-filing agents | Human authorization before any external submission. |
| US tax-season framing (W-2, 1099, IRS, e-file statuses) | Not this jurisdiction; importing them would be theatre. |
| Card/ACH-first billing | Mobile money and bank transfer dominate; card is the exception. |
| "Utilisation rate" as the headline firm metric | Forfait billing is common; hours-vs-fee and outstanding money matter more. |

---

## 4. The gap, ranked

### Firm dashboard — what to change

| # | Change | Why it matters | Effort |
|---|---|---|---|
| **F1** | **Pipeline board per service** (stage columns, drag-free links into the case) | The one view TaxDome wins on: the whole firm's work in one screen | M |
| **F2** | **"Où en est l'argent" tile row** — invoiced / received / outstanding, plus aging buckets | A firm checks receivables daily; today the dashboard shows no money at all | S |
| **F3** | **Reviewer queue with aging** (oldest first, days waiting) | "Awaiting review: 0" hides a 9-day-old document | S |
| **F4** | **Workload by person** (open items + overdue per member) | Assignment exists; capacity does not | S |
| **F5** | **Client health strip** — quiet clients, missing KYC axes, unpaid invoices | Turns the dashboard from a to-do list into a practice view | M |
| **F6** | **Recurring obligation generation** surfaced as "next period ready to open" | The engine exists; the dashboard never proposes the next job | M |
| **F7** | **Automation log** — what the system did on its own, reversible | Adopt automation without losing auditability | M |

### Client dashboard — what to change

| # | Change | Why it matters | Effort |
|---|---|---|---|
| **C1** | **Full dated action list**, not one card | Clients owe several things at once | S |
| **C2** | **Grouped document checklist per period/obligation** | Matches how the firm asks, reduces back-and-forth | M |
| **C3** | **Declaration tracker always visible** (prepared → submitted → proof → verified) with evidence | The client's first question is "where is it?" | S |
| **C4** | **Payments adapted to CEMAC** — MoMo / transfer / cash receipt, declared vs reconciled | Billing is the weakest client-side area today | M |
| **C5** | **KYC confirmation prompts** — NIU, régime, centre, référentiel | A wrong axis produces a wrong deadline | S |
| **C6** | **Notification channel preference** (WhatsApp / SMS / email) with consent log | Email-only assumes a behaviour this segment does not have | M |

Effort: S ≈ 1–2 days, M ≈ 3–5 days, in this codebase.

---

## 5. What this means

We are **ahead of TaxDome on compliance correctness** — obligation-driven dates,
three document verdicts, evidence-gated filing, tenant isolation — and **behind on
practice operations**: pipeline, capacity, receivables, automation, and client
collection friction. Nothing in the peer set requires us to weaken a rule; the
adoptions above are all derived from records we already keep.

Recommended order: **F1, F2, F3** on the firm side and **C1, C3, C5** on the client
side — six changes that close the operational gap without inventing a single
regulatory claim.
