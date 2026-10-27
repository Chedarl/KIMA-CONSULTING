# KIMA Compliance OS

Tax compliance management, accounting workflow automation and digital taxpayer
services. Initial market Cameroon, expansion CEMAC. French and English, XAF.

**Clear Records. Confident Compliance.**
**Vos comptes en ordre. Vos obligations maîtrisées.**

> Interface prototype with demonstration data only. No DGI authorization,
> partnership or e-filing integration is established or claimed.

---

## Why this exists

Cameroon already has télédéclaration, so the fair question is what a
practice-management layer adds. The **TADAT 2025 assessment** — the
IMF-affiliated tax administration diagnostic, scoring nine areas A–D against
2024 data — answers it in three numbers:

| Indicator | 2017 | 2025 |
|---|---|---|
| D4-14 — use of e-filing | D | **A** |
| D4-12 — on-time filing rate | C | **C** |
| D6-19 — verification of declared accuracy | C | **D** |

The state solved the filing channel and did not solve compliance. Preparation
happens in the taxpayer's and the accountant's hands, which is where no
government portal reaches. The full analysis — five competitive wedges and the
CEMAC thesis — is in the approved plan (see **Where the work stands**).

---

## What is here

| Path | Contents |
|---|---|
| `docs/blueprint/` | The product baseline — Business Concept Note, PRD and AI Development Blueprint v1.0 |
| `docs/foundation/` | Sitemap, ERD, permissions matrix, risk register and the research below |
| `docs/audits/` | Dated audits. **`2026-10-27-taxdome-parity/`** — TaxDome feature parity, verified module status, journey stop points, security reassessment (incl. the migration pipeline failing since 23 Oct), roadmap; start with `executive-summary.md`. `agent-b-parity-and-journeys.md` is Agent B's review of Agent A's parity and journey findings |
| `docs/strategy/` | Dated strategy responses. **`2026-10-27-taxpayer-first/`** answers the owner's taxpayer-first brief: thesis, gap matrix, journeys, backlog, sources, test protocol — a proposal awaiting approval. Its `agent-b/` folder holds Agent B's incident-recovery plan (journey, wireframes, component specs, state machine, implementation plan, acceptance tests) |
| `docs/design/` | Generated design system — **superseded**; it predates the blueprint, and blueprint §9 is the authority |
| `app/`, `components/`, `lib/` | The Next.js application |
| `supabase/` | Forward-only migrations in `supabase/migrations/` (applied by CI on push to `main`) and backend notes — see Backend and `docs/deployment.md` |

Read `CLAUDE.md` before changing anything. It carries the hard constraints: no
invented tax rules, no claimed government integration, four axes never
collapsed (taxpayer type / regime / tax centre / accounting framework), the
abolished regimes, prorogations, three verdicts per document, evidence-gated
filing status, tenant isolation.

### Foundation research

| Document | What it settles |
|---|---|
| `practitioner-notes-2026-10-21.md` | The second Irina session, claim by claim, and the four conflations it exposed |
| `cameroon-rule-corpus-research.md` | The rule corpus with sources, effective dates and verification status. **Read before touching any rule** |
| `harmony2-dgi-platform-research.md` | The DGI's Harmony 2 portals, what they streamline, and the line between retrieval and integration |
| `portal-patterns-research.md` | PwC Connect, EY Canvas, KPMG Clara, TaxDome, Canopy, Karbon — adopt / adapt / reject |
| `sage-dsf-ingestion-research.md` | Sage export formats, DSF workbooks, parsing rules |
| `risk-register.md` | 46 risks with phase gates. **R-36 blocks real taxpayer data** |

---

## Architecture

The product is a **rule-pack platform**, not a Cameroon app. The accounting
substrate is already harmonised across CEMAC (SYSCOHADA révisé; the DSF
harmonised with OHADA accounting law) while rates, deadlines, centres and
platforms are national. So: one engine, six thin rule packs.

| Module | Responsibility |
|---|---|
| `lib/rules.ts` | The rule registry. Every rule carries citation, authority, jurisdiction, effective dates and a `VerificationStatus`. **Unverified rules are inactive by construction** — `isActive()` is derived from provenance, never set by hand. Also regimes, tax centres, obligations, prorogations and the Harmony 2 portal map |
| `lib/document-review.ts` | Three independent verdicts per document — accounting, charge deductibility, VAT recovery — which may disagree. A verdict resting on an unverified rule escalates instead of deciding |
| `lib/document-naming.ts` | The filing framework: one grammar read in two directions. Folders are generated from the client's obligations, and the folder a document lands in decides its name |
| `lib/crm.ts` | People and files. Contacts are many-to-many with taxpayers, because the SARL owner who also files IRPP is one person with two files. **Segments are derived, tags are typed** — a segment is computed from the verified profile and carries whether it is confirmed; a tag is whatever the firm decides |
| `lib/cases.ts` | The case engine — the MVP 1 spine. One obligation, one taxpayer, one period, generated from verified obligations rather than configured. **Four status dimensions kept apart**: our work, what the administration acknowledged, whether the *tax* was paid, and whether *we* were paid. Filing moves on evidence, never on effort |
| `lib/registration.ts` | How a person approaches Kima. Lifecycle state machine with the KPI timestamps set in one place, so "time to first response" means the same thing everywhere. Everything an applicant types is a `declared_` claim until a reviewer confirms it. Completeness scoring is **advisory, never a submit gate** |
| `lib/organizer.ts` | The intake questionnaire. Derives **documents only**, never obligations |
| `lib/diagnostics.ts` | Pre-approval gating on a declaration |
| `lib/portal-auth.ts` | Demo portal sign-in. **Read the security note in its header before extending it** |
| `lib/i18n.ts`, `lib/i18n-workspace.ts` | Bilingual dictionaries. `en` is typed against `typeof fr`, so locale parity cannot silently drift |

Current rule-pack coverage, from `packCoverage("CM")`: **14 rules, 1 verified,
13 inferred.** Only the patente renewal date is actionable as an obligation.
(`packCoverage` counts regimes, centres and obligations; the verified VAT rate and
cash-threshold sources sit outside that count.) That ratio is the constraint
working, not a gap to paper over — and it means an IGS taxpayer currently sees
**no** active obligation, because every IGS rule is `inferred`.

---

## Routes

Every route is locale-prefixed; `/` redirects to `/fr`.

| Route | Surface |
|---|---|
| `/fr`, `/en` | Public overview |
| `/fr/register` | **Public application** — four intake paths (online / WhatsApp / agency / referral). The only anonymous write path in the system |
| `/fr/login` | Portal sign-in — name plus identifier, then an 8-digit one-time code (R-36 close-out) |
| `/fr/app` | Taxpayer portal — one next action, checklist, progress |
| `/fr/app/{compliance,declarations,documents,messages,payments,archive}` | Client surfaces |
| `/fr/workspace` | Firm workspace — portfolio, intake queue, review gate |
| `/fr/workspace/clients` | Client list and onboarding wizard |
| `/fr/workspace/inbox` | Document inbox **and the three-verdict acceptance panel** |
| `/fr/workspace/filing` | The filing framework — reference builder, folder tree, filename reader |
| `/fr/workspace/{messages,reviews}` | Messaging and approvals |
| `/fr/design` | Design system — tokens, contrast, status honesty, components |
| `/fr/prototype/incident`, `/en/prototype/incident` | **Incident-recovery prototype (Agent B) — synthetic data, local state only.** "Debited, payment not recognised" for the fictional Boutique Ndolo: five status dimensions, one next action with its source, "record what happened", masked references, escalation log, taxpayer/reviewer switch. Not linked from any nav, `noindex`, no backend. Plan: `docs/strategy/2026-10-27-taxpayer-first/agent-b/` |

Nav entries marked `ready: false` in `app/[locale]/workspace/layout.tsx` are
visible but disabled on purpose, so the shape of the product stays legible
without pretending the modules exist.

---

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test           # pure-engine assertion harness
npm run build
npm start          # serves the production build
```

Next.js 14 (App Router) · TypeScript · Tailwind CSS 3 · Supabase.

Fonts: **Inter** (body), **Poppins** (display), **IBM Plex Mono** (figures),
loaded through `next/font`. Their CSS variables are defined on `<body>`, not
`:root` — moving them silently breaks the whole font stack, so read the comment
in `tailwind.config.ts` first.

> On Windows, `pkill` does not reliably stop `next start`. If a port stays
> busy, find the owner with `Get-NetTCPConnection -LocalPort <port> -State
> Listen` and `Stop-Process -Id <pid> -Force`. A stale server serving a
> rebuilt `.next` produces confusing `ChunkLoadError` failures in the browser.

### Environment

Copy `.env.example` to `.env.local` and fill it in. Required for the browser
client: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Required
for OTP sign-in and authenticated mail: `SUPABASE_SERVICE_ROLE_KEY`, plus
`RESEND_API_KEY` and `KIMA_MAIL_FROM`. For synthetic demos without Resend, set
`KIMA_DEMO_OTP_REVEAL=1` so OTP routes return the code in the response body —
never with real taxpayer data. `.env.local` is gitignored.

---

## Working from a phone or browser

This repo is set up for **Claude Code cloud sessions**, so the work can
continue from claude.ai/code or the **Code** tab in the Claude mobile app. The
session runs on a cloud VM that clones this repository, so everything it needs
must be either committed here or set on the cloud environment.

**One-time setup** (account-level — only the repo owner can do these):

1. **Connect GitHub.** Easiest path if you have the GitHub CLI authenticated:
   run `/web-setup` inside the Claude Code CLI. It sends your `gh` token to
   your Claude account and creates a cloud environment. Otherwise go to
   [claude.ai/code](https://claude.ai/code), sign in with GitHub, and install
   the Claude GitHub App on the account that owns this repository — a private
   repo is invisible to cloud sessions until that app is installed on it.
2. **Add the environment variables.** At claude.ai/code, open the environment
   selector → edit → **Environment variables**, and add the four from
   `.env.example`. The repo is cloned fresh each session, so `.env.local` is
   never present and anything not set here does not exist.
3. **Set the setup script.** Paste `scripts/cloud-setup.sh` into the
   environment's **Setup script** field. It runs `npm ci` and a typecheck
   before the session starts, and the result is cached — keep it under the
   ~5-minute budget or the cache is skipped.
4. **Install the app.** iOS or Android, then open the **Code** tab. Running
   `/mobile` in the CLI shows a QR code for the right store.

**What is already committed for this**

| File | Purpose |
|---|---|
| `.env.example` | Names the required variables. No values. |
| `scripts/cloud-setup.sh` | The cloud environment's setup script |
| `.claude/settings.json` | Allowlists routine commands so a phone session is not a wall of approval prompts, and **denies reading `.env*`** so secrets cannot be printed into a synced transcript |
| `CLAUDE.md` | Loads automatically every session, cloud included |

**Worth knowing**

- Cloud sessions offer **Accept edits**, **Plan** and **Auto** permission
  modes. There is no Manual or Bypass.
- A cloud session pushes a branch and you review the diff; it does not commit
  to `main` behind your back.
- `claude --cloud "<task>"` starts one from the terminal; `claude --teleport`
  pulls a cloud session back into your terminal to continue locally.
- The cloud VM clones **the GitHub remote at your current branch**, not your
  local working tree. Push first, or local commits will not be there.
- Plan locally, execute in the cloud: agree an approach in plan mode, commit
  the plan, then hand the execution to a cloud session.

### Testing the pure engines

```bash
npm test
```

`scripts/engine-check.mjs` compiles the engines with `--strict` into a scratch
directory and runs Node assertions (rule activation, proposeCases, permissions,
command layer, three verdicts). CI runs the same command. **Add assertions with
every rule or permission change.** Expanding coverage toward the earlier F2–F4
counts remains open work.

```bash
npm run test:journey
```

`scripts/journey-check.mjs` does the same for the incident prototype
(`lib/incidents.ts`, `lib/next-best-action.ts`, fixtures F-1…F-4 in
`lib/mocks/incidents.ts`): test-protocol A-2 (no `verified` without official
evidence; a debit never reaches `verified`), A-7 (exactly one next action, each
with a verified source or the "not yet confirmed — ask your tax centre"
fallback), A-8 (never suggests paying again while a debit is unresolved), and
"a taxpayer can never set verified or resolved". Each check counts its own
assertions and fails if none ran. Not yet in CI — `.github/workflows/` is Agent A's.

### Verifying UI

`tsc` and `next build` green, then check both locales at 375 / 768 / 1024 /
1440. Non-negotiables: 4.5:1 text contrast, visible 3px focus rings, 44×44px
touch targets, `prefers-reduced-motion` respected, SVG icons and never emoji.

---

## Design

Blueprint §9 is the authority: deep navy `#163B66`, teal green `#1E9E74`,
white, soft gray `#E9EEF3`, dark text `#142235`, amber reserved for genuine
warnings. Tokens live in `app/globals.css` as CSS variables, so light and dark
swap without touching component code.

Note the split between a brand colour and its text colour: teal is about 3:1 on
white, so `--teal` is a fill and `--teal-text` is the type colour. Never use a
fill colour for text.

Reusable effect utilities in `app/globals.css`, available anywhere in the app:

| Class | Effect |
|---|---|
| `.aurora` + `.shape .shape--teal` / `.shape--navy` | Blurred shape accents, drawn in CSS so there is no image payload |
| `.halo` / `.halo--ink` | Radial hero wash; `--ink` stays dark in both themes |
| `.spotlight` | Card lit from its top edge |
| `.text-gradient` | Gradient type — hero tagline only, with a fallback where `background-clip: text` is unsupported |
| `.hairline` | Section divider that fades out at both ends |
| `.lift`, `.rise-in`, `.marquee` | Hover lift, entrance, logo marquee |

Everything is static or motion-guarded. The users are on slow Cameroonian
connections (Scenario J), so decorative payload is a correctness concern rather
than a matter of taste.

---

## Backend

Supabase project `kima-consulting`, ref `vhrnrbnjhmxrygvyfirf`, eu-west-3.

> **Synthetic data only** (risk R-32). Never write real taxpayer data.

RLS is enabled on every table, and the rules that matter are CHECK
constraints rather than application conventions — each one verified against a
direct SQL write, not only through the interface:

| Guarantee | Enforced by |
|---|---|
| A declaration is never `filed` without evidence reference, capture date and source | `declarations` CHECK |
| A case's filing is never `verified` without an evidence reference | `filing_verified_requires_evidence` |
| A case is never delivered without a filing outcome | `delivery_requires_filing_outcome` |
| An engagement fee is whole XAF, never a float | `fee_xaf integer`, `>= 0` |
| A request can never attach to another taxpayer's case | composite FK `(case_id, taxpayer_id)` |
| An internal event can never be marked client-visible | `event_visibility_allowed` |
| Billing never appears in a compliance history | `event_billing_never_client_facing` |
| Every change carries a name unless the actor is `system` | `event_actor_named` |
| A self-approval is permitted but can never be silent | `self_approval_must_be_disclosed` |
| An approval records who and when, together | `approval_is_dated` |
| A deactivated member carries the date they left | `inactive_has_a_date` |

**`case_events` is append-only.** No UPDATE or DELETE policy exists, and
UPDATE, DELETE and TRUNCATE are revoked from `anon` and `authenticated`. The
guarantee is precise: *no client key can rewrite or erase a case history.* The
service role keeps its privileges, as migrations need them.

**The log is not the truth — the case row is.** The log records what happened
to it. Keeping both is what makes `drift()` possible: if a row says `verified`
and no verification was ever logged, something wrote around the engine, and
that is worth catching before a client is told their declaration was accepted.
A dimension the log is silent about is *not* drift; silence is missing
coverage, not a contradiction.

**Every migration is in the repo** — `supabase/migrations/` holds the full set
under their remote versions, verified on every PR and applied on push to `main`
(see `supabase/migrations/README.md` and `docs/deployment.md`).

---

## Where the work stands

The approved plan is at `~/.claude/plans/i-think-i-have-glowing-quasar.md` on
the owner's machine — ask for a copy if you do not have it.

**Latest (27 Oct 2026): the taxpayer-first brief.** The owner's handoff
repositions Kima around the taxpayer when the DGI's own systems fail them
(payment-stage errors, a debit not recognised, an ACF refused). The answer is in
`docs/strategy/2026-10-27-taxpayer-first/`. **The blueprint stands** — a taxpayer
may start alone and record what happened, but only a reviewer moves anything to
verified. It also records an audit of `main` that found **document upload does
not work end to end for any signed-in user** (storage policies are anon-only),
that clients can forge `case_events`, and several screens that state completion
that is not true. Those are the P0 items in `backlog.md`; nothing is built until
the owner approves that proposal.

**Audit (27 Oct 2026).** `docs/audits/2026-10-27-taxdome-parity/` finds that nothing is yet end-to-end WORKING (engines are; no DB or E2E tests), that firms cannot create cases, tasks, contacts or invoices and registered taxpayers cannot get a sign-in, and that **production migrations have failed since 23 Oct** (repair is in open PR #6). Awaiting owner approval; nothing applied.

**Owner answers (27 Oct 2026, second round).** The reviewer is an expert-comptable;
incident recovery is part of the engagement; the system itself should fetch the
current official texts and turn them into plain-language news in the taxpayer
workspace, published only after an expert-comptable approves (backlog P1-9); 5-10
real IGS taxpayers can join the comprehension test; and the **accounting-firm
sign-up option is now hidden** (`OPEN_WORKSPACE_KINDS` in
`lib/public-onboarding.ts`) until firms are scoped to their own clients.

**Done**

- **Phase 0** — rule registry widened into a CEMAC rule-pack platform, with
  jurisdiction-scoped selectors and `packCoverage()`
- **Phase 1** — the filing framework and the three-verdict acceptance panel,
  both surfaced in the firm workspace
- **Phase 1b** — landing page rebuilt in the Cruip "Open" idiom on the Kima
  palette, with the reusable effect utilities above

- **Phase 2** — client layer: contacts ⟷ taxpayers, per-link access, derived segments
- **F1 Registration** — public application at `/register`, four intake paths,
  lifecycle + KPI timestamps, verified end-to-end through the anonymous insert
  policy (41 assertions)
- **F2 Case engine** (`lib/cases.ts`) — a case is one obligation × one taxpayer
  × one period, **generated** from verified obligations rather than configured.
  Stage flow that models work going backwards; the review → filing gate; the
  four status dimensions kept apart (work · filed · tax paid · our fee paid);
  the authority chain taxpayer → engagement → case → request; tasks and a
  derived blocker (86 assertions)
- **F3 Activity log** (`lib/events.ts`) — one change recorded once, read by
  every surface. 34 event kinds with visibility derived from the kind and
  mirrored by a SQL CHECK; refusals at the gates are recorded, not silent;
  `drift()` reports where a row and its own history disagree; the request →
  case chain with a composite FK and a second gate (documents → accounting is
  refused while any attached document is unaccepted) (95 assertions)
- **F4 Roles and permissions** (`lib/permissions.ts`) — capabilities as a
  readable matrix rather than conditionals spread through the app. Firm access
  is by role, client access is by contact link, and the two types do not
  overlap. **`kima_admin` has no professional authority**: it manages members
  and the rule corpus and cannot review a document, verify a filing or
  authorise an engagement. The system itself may generate and remind, never
  judge. **Separation of duties**: entering review stamps who prepared the work,
  and `review → filing` consumes a `canApproveReview()` decision it cannot
  fabricate — self-approval is refused outright in a firm with two
  professionals, and permitted but *disclosed* for a sole practitioner, with
  the disclosure written into the client-visible history and enforced by a
  CHECK constraint (81 assertions)

### How work is built now

**MVP 1 is the frame** — firm case-management engine, assisted onboarding,
client profiles, document inbox, requests, status tracker, archive — and every
feature passes the same seven-step gate before the next one starts:

> plan (`/ecc:plan`) → design sketch → schema (RLS + constraints) → pure engine
> with `node` assertions → surface → review + browser check at four widths →
> commit with this README updated in the same commit

A feature is not done until step 7. This exists because the alternative already
bit us: engines shipped with no UI for several commits, and a client list
rendering against seed data that stored display labels where the engine expected
codes — a defect that survived three commits because nothing forced the join to
be exercised.

**Next**

- **F5 The seven error scenarios** (handoff spec §7) as real states rather than
  as UI copy — DGI outage mid-submission, a document that arrives by WhatsApp
  with no request, a revoked engagement mid-period, and the rest
- **F6 Triage queue** — the firm's side of registration, with the first-response
  target shown at the point of work
- **F7 KPI standard** — `docs/foundation/client-registration-standard.md`, each
  KPI defined once and computed once in the `registration_kpis` view

**Where authentication now stands (F5).** The capability matrix exists twice
on purpose — in `lib/permissions.ts` so the interface can reason about it, and
in `public.role_capabilities` so RLS can enforce it — and the harness asserts
the two are the same set. `can_see_taxpayer()` is the single question every
tenant-scoped policy asks, and an audit of all 41 policies found **eleven
reading `using (true)`**, including `taxpayers` UPDATE, which let any caller
rewrite any taxpayer's NIU, regime or tax centre. All are scoped now, and the
four that still read `true` are reference data: the firm roster, the
organisation, the capability matrix and tags.

Still open, and it is the honest limit of this increment:

- **Nobody can sign in as a firm member yet.** `firm_members.auth_user_id` and
  `contacts.auth_user_id` exist and the policies read them, but no sign-in
  screen fills them. Until one does, firm capabilities evaluate to false for
  every caller and the interface runs on the anonymous demo branch.
- **`can_see_taxpayer()` has a third branch**: with no session, the caller sees
  the demo taxpayer. That is what keeps the current interface working. It is
  one line, written on its own line, and **must be deleted before real taxpayer
  data exists** (R-32).
- **R-36 close-out (applied as `20261023010535` through `20261023010729`).** Portal and firm OTP
  flows are wired in the app (`/login`, `/firm-login`). The server issues an
  8-digit code via `portal_issue_code` / `firm_issue_code` (service role only),
  delivers it through Resend (or `KIMA_DEMO_OTP_REVEAL=1` for synthetic demos),
  verifies it, and mints a Supabase Auth session. `portal_sign_in` is revoked.
  The anon demo branch of `can_see_taxpayer` is off unless
  the `allow_demo_anon` row in `app_flags` is true.
- **`case_tasks` is now firm-only**, so with no firm session the work queue's
  task fetch returns empty and the derived blocker falls back to requests.
  Correct behaviour, and a visible consequence of the above.

### The front end, against the ten-screen handoff

Three conflicts in the supplied boards were settled before building rather than
during:

| Conflict | Resolution |
|---|---|
| Gold/amber as the primary CTA, while blueprint §9 reserves amber for warnings | **Amber stays the warning colour; CTAs use teal.** Otherwise "Upload document" and "Action needed" are the same colour on the same screen |
| "200+ clients", "95% on-time filings" | **Removed unless sourced.** We have no such figures |
| "Filed on DGI (Harmony)" | **Never used.** It reads as a government integration we do not have and are forbidden to claim. "Filing evidence recorded" says what is true |

**Screen 03/05, the firm dashboard, is built** (`components/live/firm-dashboard.tsx`,
mounted at `/[locale]/workspace`). It replaced a page that rendered
`lib/demo-data` — a hand-written array that looked like a practice and answered
to nothing. Every figure now comes from `compliance_cases`,
`document_requests`, `case_tasks` and `case_events` through the same engines
the rest of the product uses, which is the handoff's non-negotiable rule: the
request an accountant raises is the record the client's portal shows.

Two things it deliberately does NOT do:

- **It does not invent movement.** The boards show a trend beside every tile
  ("+2 this week"). Only "open cases" has the history to support one
  (`opened_at`); the rest are absent rather than fabricated.
- **It shows nothing rather than stale numbers** when the data cannot be
  reached. A dashboard still displaying last week's figure during an outage is
  how a deadline gets missed.

The fourth tile reads **"At risk"**, not the boards' "Blocked cases": `risk()`
already exists and is tested, while "blocked" would double-count the cases
already in "waiting on clients".

**Screen 08, the client dashboard, is built** (`components/live/client-dashboard.tsx`,
mounted at `/[locale]/app`) and it is where the interaction rule is actually
demonstrated rather than asserted. It reads the same rows the firm dashboard
reads, and **it writes**: sending a document updates `document_requests.status`
and records a `request_submitted` event with the CLIENT as actor.

Verified in the browser with both screens open: clicking "Send this document"
moved the request out of the client's action list (2 to 1), raised "documents
sent" (2 to 3), and the firm's activity feed showed *"Document received: Bank
statement — September · Mboa Traders SARL · Client sees this"* — with no
refresh, and nobody re-keying anything.

> **Superseded (27 Oct 2026).** That check predates the auth close-out. Under the
> current schema a signed-in client's file upload is refused by storage, and an
> anonymous one cannot write the `documents` row — see
> `docs/strategy/2026-10-27-taxpayer-first/gap-matrix.md` §2. Fixing it is P0-1.

Three rules the screen enforces in its own right:

- **Received is not accepted.** Sending moves a request to `submitted`, never
  `accepted`. The client cannot approve their own document, the case stays
  blocked, and the screen says so in words instead of letting a green tick
  imply it.
- **It shows the client vocabulary, not ours.** The boards draw the progress
  tracker from the firm's internal stages (documents, preparation, review,
  filing). Those are ours. The rail is built from the five client-facing
  states: it looks the same and does not leak which draft went back to whom.
- **The name comes from the record**, not from a translation file. The shell no
  longer greets by name on every page — the same duplicate-greeting defect the
  firm side had, where a static "Welcome back" fought a computed one.

It subscribes to `document_requests`, `case_events` and `compliance_cases`, so
an accountant's decision reaches the client without either of them pressing
anything.

**Client record pages are now live too** (`components/live/client-records.tsx`,
mounted at `/[locale]/app/{compliance,declarations,archive}`). They used to
render `lib/demo-data` — an invented profile and invented obligations — while
`lib/rules` and the case engine sat unused by them. They now read `taxpayers`,
`compliance_cases`, `document_requests` and `case_events`: the four axes on
separate rows with an unverified profile flagged on its face, progress in the
five client states via `clientStatus()`, per-case history from client-visible
`case_events`, and an archive that only lists a case when its filing is
`verified` AND carries an evidence reference. Which backend process has which
surface — and which have none yet — is tracked in
`docs/foundation/frontend-backend-coverage.md`, updated in the same commit as
every screen.

**Still missing on this screen**: "Send this document" records that a document
was sent; it does not yet carry a file. Storage wiring and the assisted/paper
intake path are their own piece of work.

### Screen 06 — the compliance case (firm side)

`components/live/case-detail.tsx`, at `/[locale]/workspace/cases/[caseId]`,
linked from both the queue and the dashboard. **This is where the engines stop
being libraries and become a workflow.** A stage move is `advance()`; the review
gate is `canApproveReview()`; the checks are `caseFindings()`; the history is
`eventsFromAdvance()`. The page decides nothing itself.

- **Refusals are shown before they are attempted.** The screen runs the gate for
  every allowed move and prints why it is refused —
  *"Documents are not yet accepted. Received does not mean accepted."*
- **New engine piece**: `lib/case-diagnostics.ts` asks the existing diagnostics
  about a case. An adapter, not a second rule set: `NO_REVIEWER` and
  `SELF_APPROVAL` are dropped because for a case that decision belongs to
  `canApproveReview()`, which knows about roles, disclosure and the sole
  practitioner. 15 assertions.
- Accept or return a document (accepting is a judgement, and only the firm's);
  toggle a task; write a note whose audience is chosen; move the stage.
- `drift()` is on the page: if the row and its own log disagree, the case says
  so in red rather than quietly rendering the row.

**Remaining screens**: 01 registration · 02 business onboarding · 04 client 360
· 05 document centre · 07 review and filing · 09 mobile portal · 10 delivery
and archive.

### The auth close-out changed what works without signing in

The fix-forward branch (`20261023010535` through `20261023011145`) is
applied. **Seeing is no longer mutating**: every write names the capability it
needs, from the same matrix `lib/permissions.ts` holds. Measured through the
publishable key: an anonymous caller reads the 4 demo cases and 5 requests,
sees **0 internal events** and **0 tasks**, is refused `portal_accounts.otp_hash`
outright — and cannot change anything.

Three things that cost real time, recorded so nobody pays twice:

1. **A refused UPDATE is silent.** PostgREST answers a PATCH matching zero rows
   with HTTP 200 and an empty body, and supabase-js reports no error. Every
   update now goes through `lib/db-write.ts`, which asks for the changed rows
   back and treats "no rows" as a refusal. Without it the client portal would
   show a document as sent while the database ignored it.
2. **The OTP hash was readable by anon** after a column revoke that was a
   no-op under a table-wide grant. An 8-digit code behind `sha256(code || id)`
   is recoverable offline in seconds. Fixed in `20261023010824`.
3. **The demo switch had no handle.** The gate was a GUC to be set with
   `alter database … set`, which managed Supabase roles may not do. Moved into
   `app_flags` (`20261023011145`), default off. It is currently **true** on the
   synthetic project so the demo can be read; **it must be false before any
   real taxpayer data exists (R-32).**

**To make the firm and portal screens writable you need `SUPABASE_SERVICE_ROLE_KEY`**
in `.env.local` — it is not on Vercel either. Without it `/api/firm/request-code`
answers 503, no session can be minted, and every write is correctly refused.
`KIMA_DEMO_OTP_REVEAL=1` is already set locally, so the one-time code is shown
in the browser while no mail domain is verified.

Synthetic identities seeded for the controls to be visible rather than
theoretical: `irina@demo.kima.cm` (partner), `paul@demo.kima.cm` (reviewer),
`awa@demo.kima.cm` (staff) — three active professionals, so
`requiresSecondReview()` is true and self-approval is refused outright. The
portal contact is `jean.mbango@example.cm`. `taxpayers.niu` held a **masked
display string** (`P0582 •••• 417K`) where a code belongs, so no client typing
their own NIU could ever have matched; it now holds a synthetic
structurally-valid value.

**Known open items**

- `SUPABASE_SERVICE_ROLE_KEY` is still unset — the one thing standing between
  the screens and a real session (the migration is applied and the emails are
  seeded)
- Expand `npm test` coverage toward the full F2–F4 engine suites
- `docs/design/.../MASTER.md` is stale and contradicts blueprint §9
- Drop the `activity_events` table once the live project has run long enough on
  `case_events` alone (writers now prefer `recordCaseEvent`)
- **A write that reads back its own row now fails for an anonymous caller.**
  `.insert(...).select()` needs SELECT, and several tables no longer grant it.
  Nothing in the codebase does this today — every insert uses the default
  `return=minimal` — but it is a trap worth knowing before someone adds one
- The RLS helper functions (`can_see_taxpayer`, `member_has`,
  `current_firm_role`, `client_taxpayer_ids`) sit in `public`, so PostgREST
  exposes them as RPC endpoints. They cannot simply be revoked, because a
  policy expression runs as the calling role and needs EXECUTE. The proper fix
  is to move them to a schema PostgREST does not expose; it touches every
  policy, so it is deliberate work rather than a quick patch
- `portal_sign_in` execute grants are revoked by the auth-closeout migration
- `demo_taxpayer_id()` remains executable; the anon branch that uses it is off
  unless the `allow_demo_anon` row in `app_flags` is true
