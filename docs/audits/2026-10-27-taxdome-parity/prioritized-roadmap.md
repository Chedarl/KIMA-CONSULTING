# Prioritised roadmap

*Agent A proposal for owner approval. Effort assumes one engineer working with an
agent: **S** ≤ 1 day, **M** 2–4 days, **L** ≥ 1 week. Each item follows the repo's
seven-step gate and is its own reviewable PR. Nothing here starts before approval.*

## Sequencing principle

The owner's first milestone is *a secure, demonstrable workflow that helps a taxpayer
investigate an unrecognised tax payment without wrongly declaring it complete*
(Journey D). That journey needs three things from the other phases: a taxpayer who can
sign in, working document storage, and a trustworthy event log. So the provisional
phases are re-sequenced to deliver that milestone first. Broader practice-management
parity follows.

## P0 — Security and reliability (Agent A; blocks everything)

| # | Item | Depends on | Effort | Risk if done badly |
|---|---|---|---|---|
| P0-a | **Repair the migration pipeline** by merging Cursor's open PR #6, or cherry-picking its two migration files | — | S | Every later migration silently fails to reach production |
| P0-b | Storage policies by taxpayer path; client write limits (events, messages, documents, requests); delivery needs a verified filing; realtime tables | P0-a | M | A wrong path predicate reopens cross-tenant reads |
| P0-c | OTP hardening, a single identity per sign-in, commit the Edge Function source, relay without a service-role key in Vercel | P0-a | M | Account takeover; a broken sign-in |
| P0-d | Honest status copy; refused writes shown as refused | — | M | False "filed/paid/complete" |
| P0-e | Session-scoped IDs (`demoIds`, `limit(1)`); valid fixtures; **SQL negative-test suite in CI** | P0-b | M | Records land on the wrong taxpayer; tests prove nothing |

## P1 — Minimum practice foundation for the milestone (shared)

| # | Item | Owner | Depends on | Effort |
|---|---|---|---|---|
| P1-a | **Application → client conversion**: a reviewer turns a `registrations` row into a taxpayer + contact + portal account, so the taxpayer can sign in (fixes Journey B at B2) | A (schema/RLS), B (screen) | P0-c | M |
| P1-b | **Open a case** from a proposal (`proposeCases()` → insert), only for active (verified) rules or a reviewer-entered obligation | A + B | P0-b | S–M |
| P1-c | Create, assign and date tasks | B | P0-b | S |
| P1-d | Expert-comptable credential on `firm_reviewer` (owner answer 1) | A | — | S |

## P2 — Compliance intelligence and recovery (the milestone)

| # | Item | Owner | Depends on | Effort |
|---|---|---|---|---|
| P2-a | Tax-payment states and `recordPayment()` with a DB CHECK (`verified` needs evidence and a reviewer) | A | P0-b | M |
| P2-b | Incident tables (`incidents`, `incident_evidence`, `incident_contacts`), RLS, client event kinds | A (schema), B (contract sign-off) | P0-b, P2-a | L |
| P2-c | Incident screens, evidence capture (mobile camera), escalation log, FR/EN | B | P2-b; mocks until then | L |
| P2-d | `nextBestAction()`: one action, cites a verified source or says "not yet confirmed", never suggests paying twice | B (content), A (rule tests) | P2-a, P2-b | M |
| P2-e | Case-file export marked "not an ACF" | B | P2-b | M |
| P2-f | Official-text register and plain-language bulletins approved by an expert-comptable (P1-9a/b) | A (register), B (news UI) | P0-b, P1-d | M + M |
| P2-g | Comprehension test with 5–10 IGS taxpayers on synthetic scenarios | Owner + B | P2-c | — |

**Milestone exit:** Journey D runs end to end on synthetic data; tests T-01…T-20 and
the A-1…A-11 checks in `test-protocol.md` pass; zero false "paid" in the comprehension test.

## P3 — Advanced SaaS capabilities (after the milestone; each needs evidence of demand)

| # | Item | Precondition |
|---|---|---|
| P3-a | Firm billing: invoice issuance, numbering, Mobile Money | Owner pricing decision; open PR #6 is the start |
| P3-b | Proposals and engagement letters with client acceptance | P3-a |
| P3-c | Automation: recurring case generation from verified rules, reminders, notifications | Scheduler choice (Supabase cron vs Edge Function) |
| P3-d | Reporting: overdue work, workload, revenue; exports | Data from P1/P3-a |
| P3-e | Team administration: invite, deactivate, workload | — |
| P3-f | Organisation scoping, then reopen firm sign-up | Owner decision to serve other firms |
| P3-g | E-signature | Verified Cameroonian legal basis for electronic signature (do not assume one) |
| P3-h | Integrations: accounting-software export (Sage), payment providers | Research first; **never** a DGI integration claim |

## Critical path

`P0-a → P0-b → (P0-c ∥ P0-d ∥ P0-e) → P1-a → P2-a → P2-b → P2-c → P2-d → milestone`

About 4–6 weeks of one engineer with an agent, if source verification (P2-f) runs in
parallel. That estimate is unvalidated; re-estimate after P0.

## Risks to the roadmap

| Risk | Mitigation |
|---|---|
| PR #6 conflicts with `main` (open 4 days) | Rebase it, or cherry-pick the two migration files only |
| Two agents editing the same files | Agent A alone touches `supabase/`, `lib/permissions.ts`, `lib/events.ts` kinds and the auth routes. Agent B alone touches the incident screens. Shared types change through one PR at a time |
| Unverified tax content leaks into guidance | Engine test: every next action carries a `verified` source or the fallback |
| A real taxpayer's data enters before the gates | R-32 / R-36 stay in force; synthetic fixtures only |
