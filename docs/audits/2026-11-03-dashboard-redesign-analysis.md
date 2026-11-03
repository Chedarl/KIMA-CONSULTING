# Dashboard redesign — what the peers do, and KIMA's own version

Date: 3 November 2026. Purpose: before redesigning the dashboards, study how the
category leaders lay out a home screen, then commit to a KIMA-style blueprint
that adopts the interaction model without copying their look.

Sources reviewed: TaxDome's interface-upgrade note and product surface map,
Karbon's Work/Work-views help, QuickBooks Online's KPI Scorecard and reporting
docs, plus the earlier TaxDome/Canopy/Financial Cents head-to-head and the
approved Product Experience rebuild brief.

## 1. What the leaders actually do

| System | Pattern | What it is |
|---|---|---|
| TaxDome | One branded app for every client interaction | clients log into one place for requests, documents, signatures, invoices and chat |
| TaxDome | Firm management = every job, deadline and team member in view | a single operational surface, not a report |
| TaxDome | Revenue operations | money (billed, collected, outstanding) lives on the home surface, not buried in a report |
| Karbon | Work with Kanban **and** List modes | one workload, two lenses, switchable |
| Karbon | Saved Work views | filter + sort, save, reorder, share; click a work item → a **work overlay** (contextual drawer) |
| QBO | KPI Scorecard | performance KPIs up front, each drilling into the transaction behind the number |

The shared principle: **every number and card is an entry point into the work,
and acting changes what the other party sees.** None of them win by more tiles.

## 2. Where KIMA already is (verified in code)

- Firm home: six clickable attention buckets, pipeline board (8 stage columns),
  money row, priority work table, deadlines, activity feed, command palette, live realtime.
- Client home: dated action list, service progress dots, a details prompt card.

So KIMA has the *data*; what it lacks is the *topology* the leaders use: a
contextual overlay instead of a route jump, a list/kanban toggle, saved views,
and a client home organised around the four questions rather than KPIs.

## 3. Adoption matrix

| Peer pattern | Verdict | KIMA form |
|---|---|---|
| Contextual work overlay (Karbon) | ADOPT | attention bucket click opens a right-side drawer showing that queue in place, with actions, not a page hop |
| Kanban + List toggle | ADOPT | the pipeline gains a list mode (same rows, different lens) |
| Saved Work views | ADOPT | filters (stage, owner, risk, client, service) saved per member, reorderable; localStorage first |
| One client app for every interaction (TaxDome) | ADOPT | the client home becomes the four-question mirror with quick actions |
| Revenue on the home surface | ADOPT | keep the money row; add an aging line and a payments-to-verify bucket |
| Drill-down KPIs (QBO) | ADAPT | buckets already link; the drawer is the drill-down, not a new report |
| Heavy data grids / 20-tile dashboards | REJECT | KIMA keeps high density but every element earns its place; slow-connection friendly |
| US-tax widgets, e-file status, utilisation headlines | REJECT | not this market; forfait billing, XAF, no DGI claim |

## 4. The KIMA-style blueprint

### 4.1 Firm home — the command centre

- Left **attention rail** (about 260px): Needs attention · Waiting on client ·
  Due soon · Overdue · Ready for review · Blocked · Payments to verify ·
  Documents received · Unread client activity — each with a live count.
- Each rail row opens a **work drawer** on the right (the filtered queue plus
  inline actions). Esc or backdrop closes it; the context is never lost.
- Main canvas: the pipeline board with a **Kanban/List toggle** and **saved
  views**; cards draggable in the next wave.
- Revenue strip stays (billed · collected · outstanding) with an aging line;
  the activity feed moves to the bottom rail or into the drawer.
- Header keeps greeting, today, who is online, the command palette and a bell
  with unread count.

### 4.2 Client home — the mirror

Four zones in order, answering the four questions:
1. **What your accountant needs** — the dated action list with upload/reply.
2. **Where my work stands** — one 5-dot progress bar per service.
3. **What is due or unpaid** — invoices and deadlines, each opening payment.
4. **How do I contact the firm** — the message thread and channels, always visible.
Quick actions (Upload · Message · Pay) sit one tap (44px) from the top.

### 4.3 Design tokens (KIMA, from CLAUDE.md)
navy #18243B · indigo #455DA8 · background #F7F9FC · border #DCE3EC ·
body #273248 · success #15803D. 44px targets, at least 4.5:1 contrast,
restrained motion, prefers-reduced-motion respected, FR/EN parity, and a visible
distinction between confirmed fact, draft, estimated risk and work awaiting review.

## 5. Delivery order
1. Firm attention rail + work drawer (reuses existing bucket counts).
2. Kanban/List toggle + saved views on the pipeline.
3. Client four-zone mirror (rearrange the existing blocks + quick actions).
4. Revenue aging line + payments-to-verify bucket.
5. Draggable pipeline + inline edits (already scoped in the rebuild goal).
Each lands as a small PR behind the Verify-migrations gate, proven by the
two-account Playwright journey (behaviour, not the page).

## 6. What this does *not* change
No new regulatory claims, no DGI integration, no invented deadlines, no
card-first payments. The redesign is a topology change over records we keep.
