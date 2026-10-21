# Client Portal Patterns — What the Big Four and the Practice-Management Tools Actually Do

Research for the Kima Client and Kima Workspace interfaces. Dated 2026-10-20.
Claims are **[VERIFIED]** from a primary vendor source, **[REPORTED]** from secondary
coverage, or **[INFERRED]**. Sources at the end.

Two tiers were studied, and the second matters more. The Big Four platforms are built for
**audit engagements at large entities**; Kima's users are a solo practitioner with ten
monthly clients, and SMEs who send photographs of receipts. The mid-market
practice-management tools are the closer analogue. We take the *information model* from
the Big Four and the *ergonomics* from the mid-market.

---

## 1. PwC Connect — the most directly useful model

**[VERIFIED]** from PwC's own client user guide.

### The request lifecycle

Connect treats a **request** as the unit of work, with an explicit status machine:
`Requested` → `In Progress` → `In Client Review` → `Returned` → `Submitted` → `Accepted`.

Two details matter more than the names:

- **`Returned` is a first-class state.** Work comes back. A portal that models only
  forward motion cannot represent the most frustrating part of the real process.
- **`In Client Review` exists before `Requested`.** An optional client-review workflow
  lets the client approve *the request itself* — its due date and assignment — before it
  becomes an obligation on them. The client agrees to the deadline rather than receiving it.

### The metrics

Connect publishes three global metrics, defined precisely:

| Metric | Definition |
|---|---|
| **Average Days Overdue** | Sum of days overdue for requests in `In Client Review`, `Requested`, `In Progress`, `Returned`, `Submitted` or `Accepted` that are past due, divided by the total number of requests past due |
| **% of Requests submitted on time** | `Submitted` or `Accepted` requests not past due, as a percentage of all `Submitted` or `Accepted` |
| **# of Requests returned more than once** | Requests whose returned count exceeds one |

The third is the interesting one: **rework is measured, not hidden.** A request bounced
twice is a signal about that request's clarity, not only about the client's diligence.

### "My Day"

A panel that surfaces only what needs action, bucketed as:

- **Overdue**
- **Due Today**
- **Due in the next 7 days**

Plus open discussions awaiting a response. **The icon is coloured only when something needs
doing, and grey when nothing does.** That is a disciplined idea: the interface is quiet by
default, so a status colour means something when it appears.

### Other mechanics worth keeping

- **My Dashboard vs Team Dashboard** — the same data filtered to "mine" or "ours".
- **Calendar view** of upcoming requests and engagement matters.
- **Discussions inside a request**, so a question lives with the thing it is about.
- **Related requests**, so a chain of dependent items stays visible.
- **Assignment of up to six users** to one request.
- **Milestones** (optional module) tracking key dates and deadlines.

## 2. PwC Engagement Center / Sightline

**[VERIFIED]** A `Requests` view showing the status of information requests and queries, a
**Tracker** following four phases of the deliverable lifecycle, and a `Dashboards` area
summarising engagement data. Clients are notified when the team publishes a document.

Transferable: the **Tracker**. A deliverable has a small, fixed number of named phases, and
both sides see the same phase names.

## 3. EY Canvas

**[VERIFIED]** from EY: a single entry point bringing teams and clients together,
integrating workflow, methodology and guidance, with *"real-time visibility into audit
progress through intuitive dashboards."*

Transferable: **one entry point**. Not a client portal plus a separate staff system with a
sync between them — one system, two views. That is already Kima's design.

## 4. KPMG Clara

**[VERIFIED]** Split into **collaboration** (clients get live status and secure data
sharing), **analytics** and **workflow**.

**[VERIFIED]** On AI, KPMG's stated position is that AI handles data-intensive tasks while
*"our auditors are in control of the decision-making process."*

That is independent confirmation of Kima Clarity AI's constraints (§7.5): a Big Four firm
reached the same conclusion about where AI stops in regulated accounting work. Worth
citing if anyone argues Kima's AI restrictions are too conservative.

## 5. The mid-market tools — closer to Kima's actual users

**[REPORTED]**, mostly from vendor and affiliate comparisons, so directional only.

| Tool | Position | Lesson for Kima |
|---|---|---|
| **TaxDome** | Most client-facing: intake forms, document requests, e-signature, secure delivery, conditional task triggers, pipeline templates, **client-facing workflow steps** | The client sees the same pipeline the firm does, in client language. Kima's "two-sided transparency", already productised by someone |
| **Canopy** | Strongest client portal: version control, **mobile document scanning**, client upload portals | Mobile capture is the feature, not the fallback. Matches Scenario J |
| **Karbon** | Internal collaboration and task management; **reportedly no native client portal**, so document exchange needs a separate tool | The failure mode Kima must avoid. A firm-only tool leaves the client chasing — problem 3.4 |

**The strategic read.** The market splits into firm-side workflow tools and client-side
portals, and firms that buy one still do the other by email and WhatsApp. Kima's
differentiator (§6.2) is being both — the right bet, and the mid-market evidence says the
client side is where the tools are weakest.

---

## 6. What Kima adopts, adapts and rejects

### Adopt

1. **The request as the unit of work**, with an explicit lifecycle including a
   **`returned`** state. `document_requests` gains a status machine rather than a boolean
   "received".
2. **The three overdue metrics**, essentially as PwC defines them. They map onto blueprint
   §17 KPIs — "missing-document follow-up volume", "percentage of engagements completed on
   schedule" — and give the pilot hypotheses something concrete to measure.
   **Returned-more-than-once is the one to copy most carefully**: it measures Kima's own
   clarity, not the client's diligence.
3. **My Day bucketing** — Overdue / Due today / Due in 7 days — on *both* sides. For the
   taxpayer it answers "what do you need from me"; for the accountant, "what is at risk".
4. **Quiet by default.** Status colour appears only where action is needed.
5. **Discussions attached to a request** rather than a general inbox (§7.1 messaging).
6. **Mine vs Firm** filtering on every workspace view.

### Adapt

7. **The client agrees to the deadline.** PwC's optional client-review-before-requested
   becomes a lighter "not ready — here is when I can". A negotiation rather than a
   rejection, which turns a missed deadline into information.
8. **The Tracker's fixed phases** become our **client-visible status**, already decided in
   `erd.md`. This research confirms the shape: a small fixed set of named phases both sides
   can see, distinct from the firm's internal workflow.
9. **Pipeline templates** (TaxDome) become **obligation-driven checklists**: the documents
   required for a monthly declaration derive from the taxpayer's verified obligations, not
   from a template someone remembered to apply.

### Reject, or defer

10. **Audit-grade engagement management** (EY Canvas, Clara workflow). Built for large audit
    teams with methodology libraries. Kima's unit is a monthly declaration, not an audit
    programme.
11. **Six assignees per request.** Kima's firms have one to five people. One owner plus one
    reviewer is the real shape.
12. **A separate Milestones module.** Obligations already carry statutory dates; a second
    date system would drift from the first.
13. **Analytics dashboards as a headline feature.** With ten clients, a dashboard needing
    aggregation to be useful is premature. The metrics are a strip, not a page.

## 7. What none of them solves, and Kima must

Every reference is built for a market where the filing system is reliable, documents arrive
digitally and bandwidth is free. Kima's §3 problems with **no analogue** in the tools
studied:

- **Intake from the channel the client already uses.** Every tool assumes the client comes
  to the portal. Kima's intake queue accepts email now and other channels later, binding
  each item to a request afterwards.
- **Preparation against a locked government workbook** with no import specification
  (see `sage-dsf-ingestion-research.md`).
- **Deadlines that vary by tax centre** rather than one filing date for everyone.
- **A reviewer pool across firms**, because a solo practitioner has no second professional
  in-house. None of the studied tools provides one.
- **Evidence as a first-class object.** PwC tracks a request to `Accepted`; Kima must hold
  the proof of filing itself, because the taxpayer — not the firm — bears the consequence.

## Sources

- [PwC — Connect User Guide for Clients v1.4 (October 2021)](https://east.connect.pwc.com/assets/help-docs/Connect%20User%20Guide%20for%20Clients_v1.4_October%202021.pdf) — **primary**: request statuses, the three global metrics and their definitions, My Day bucketing, dashboards, calendar, discussions, related requests, assignment, Milestones.
- [PwC — Engagement Center, Client Full User Guide](https://www.pwc.com/sk/en/assets/PDFs/engagement-center-client-full-user-guide.pdf) — primary: Requests view, Tracker phases, Dashboards.
- [PwC — Engagement Center FAQs for Clients](https://www.pwc.com/sk/en/assets/PDFs/engagement-center-frequently-asked-questions-for-clients.pdf) — primary.
- [PwC — Sightline Client User Guide](https://www.pwc.com/az/en/services/assets/Sightline%20User%20Guide.pdf) — primary.
- [EY — Audit Technology](https://www.ey.com/en_gl/services/audit/technology) — vendor: Canvas as a single entry point; dashboards for real-time progress.
- [KPMG — KPMG Clara, intelligent audit platform](https://kpmg.com/ch/en/services/audit/auditing-software-kpmg-clara.html) — vendor: collaboration, analytics and workflow; secure client portal.
- [KPMG — AI integration in KPMG Clara (press release, April 2025)](https://kpmg.com/xx/en/media/press-releases/2025/04/kpmg-advances-ai-integration-in-kpmg-clara-smart-audit-platform.html) — vendor: AI on data-intensive tasks, auditors retain decision authority.
- [TaxDome — practice management guide](https://taxdome.com/blog/accounting-practice-management-software) · [client portals for accountants](https://taxdome.com/blog/client-portals-for-accountants) · [vs Karbon](https://taxdome.com/karbon-vs-taxdome) · [vs Canopy](https://taxdome.com/canopy-vs-taxdome) — **vendor-authored, favours TaxDome**.
- [Karbon vs Canopy vs TaxDome (ustechautomations)](https://ustechautomations.com/resources/blog/karbon-vs-canopy-vs-taxdome-2026) · [unclekam 3-way comparison](https://unclekam.com/tax-pro-tools/crm-workflow-software/taxdome-vs-karbon-vs-canopy/) — affiliate-style, directional only.

> Vendor and affiliate claims are not independent evidence. Nothing here establishes that a
> competitor's feature is well designed — only that it exists, and how it is described.
