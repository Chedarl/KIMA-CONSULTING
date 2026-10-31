# KIMA OS

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
| `docs/strategy/` | Dated strategy responses. **`2026-10-27-taxpayer-first/`** answers the owner's taxpayer-first brief: thesis, gap matrix, journeys, backlog, sources, test protocol — approved by the owner on 27 Oct 2026. Its `agent-b/` folder holds Agent B's incident-recovery plan (journey, wireframes, component specs, state machine, implementation plan, acceptance tests) |
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
npm test           # pure-engine, upload, and Phase 7 pilot assertion harness
npm run test:phase7:pilot  # anonymous synthetic pilot scoring regression
npm run test:phase7:http -- http://localhost:3000  # requires running server
npm run build
npm start          # serves the production build
```

**Phase 7 pilot acceptance contract.** `npm run test:phase7:pilot` scores an
anonymous, aggregate-only pilot export (never NIUs, names or real documents).
Taxpayer-side gates: at least 90% correct next action, 90% complete evidence,
80% clarity on what stays unresolved, zero critical wrong instructions, zero
false completions, and the guided arm directionally faster than baseline. Time
is compared as **time-to-correct-action on unrounded sums**: a wrong trial
never counts as speed, an arm with no successful trials fails closed, and
rounding is display-only. Every pilot firm must also supply the plan's five
measures — document-collection minutes, follow-up minutes, overdue tasks,
completion visibility and willingness to pay. Missing or malformed measures
fail closed with `firm_measures_missing`; a firm that cannot see completion
state fails with `firm_completion_not_visible`.

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
`RESEND_API_KEY` and `KIMA_MAIL_FROM`. Without the service-role key the sign-in
routes relay to the `auth-codes` Edge Function instead (`lib/auth-codes.ts`).
`KIMA_DEMO_OTP_REVEAL=1` shows a code on screen **only** when the deployment is not
production (`VERCEL_ENV` is not `production`) **and** the address cannot receive
mail (`demo.kima.cm` or an `example.*` domain). A real address is emailed or the
request fails; a failed send never reveals the code (`mayRevealCode` in
`lib/auth-mail.ts`). `.env.local` is gitignored.

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

### One-time codes are not an open endpoint

`portal_request_code()` is `SECURITY DEFINER` and lived in `public`, the schema
PostgREST publishes, so it answered at `/rest/v1/rpc/portal_request_code` with
the anon key that ships in the browser. Given a display name and NIU it rewrites
that client's `otp_hash` and `otp_expires_at`, with no rate limit — so anyone
could keep resetting a client's pending code until the code the client was
actually sent stopped working. Migration `20261029212000` revokes `EXECUTE` from
`PUBLIC` as well as from `anon` and `authenticated`; `PUBLIC` is where the grant
really was, and naming only the two roles would have removed nothing. Nothing
calls it — `portal_issue_code()` replaced it and is service-role only — so
unlike the other definer helpers it can lose the grant outright rather than
having to move schema. Tests: `supabase/tests/portal_code_surface_test.sql`
(T-61, T-62). Risk R-49.
### Phase 1 environment settings

Settings that live in a dashboard rather than in this repository, recorded here
because nothing in the code can show their state and phase 1 cannot close
without them.

| Setting | Where | State |
|---|---|---|
| `app_flags.allow_demo_anon` | Supabase, `app_flags` table | **false** since 30 Oct 2026, 02:13 UTC |
| `app_flags.demo_otp_reveal` | Supabase, `app_flags` table | **false** since 30 Oct 2026, 02:13 UTC |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, all environments | **set** since 23 Oct 2026 |
| Leaked-password protection | Supabase Auth | **not available** on the current plan (Pro and up) |
| Minimum password length | Supabase Auth | 6 — see R-50 |

Both demo flags being false is what the plan asks for before any real taxpayer
data (R-32/R-36). The visible consequence: the signed-out site no longer shows
the demo taxpayer, and a one-time code is never printed on screen, so a demo
sign-in now needs the code that arrives by email.

**`KIMA_DEMO_OTP_REVEAL` can stay set, and here is why it is not a second way
in.** It is one of three conditions in `mayRevealCode()` (`lib/auth-mail.ts`),
all of which must hold before a code is shown: the flag is `1`, **`VERCEL_ENV`
is not `production`**, and the destination cannot receive mail at all
(`demo.kima.cm`, or a domain starting `example.`, reserved by IANA for this).
Production fails the second condition whatever the variable says, and a failed
send to a real address is a failure rather than a reason to reveal. `npm test`
pins both halves on every push (T-18: "production never reveals, even for an
`example.*` address"). What the variable still does is show the code on a
preview or local deployment for an address that could not have received it
anyway. The `auth-codes` Edge Function applies the same address rule and reads
`app_flags.demo_otp_reveal`, which is now false.

Removing the variable would therefore change nothing on production and would
break local sign-in, so it stays.

**The synthetic demo accounts cannot sign in on production, and that is correct
rather than broken.** Their addresses are on `demo.kima.cm` and `example.*`,
domains that cannot receive mail, so the emailed code never arrives — and with
`demo_otp_reveal` off, nothing prints it on screen either. That is the three
gates working.

**Owner decision, 30 Oct 2026, on how to demo on production instead.** Give the
demo accounts real inboxes the team controls — `demo+client@…`,
`demo+firm@…` on a KIMA CONSULTING mailbox — and leave `demo_otp_reveal` off.
The code then arrives by email exactly as it does for a real client, and nothing
is switched back on. The accepted alternative is a separate demo deployment (a
Vercel preview against its own Supabase project holding only invented data),
where showing codes on screen is harmless because there is nothing real behind
it. **Explicitly rejected: turning `demo_otp_reveal` back on in production, and
any shared demo password.** Either reopens what was closed on 30 Oct.

Two consequences of that decision worth knowing before you act on it:

- A real address is, correctly, **not** an undeliverable one, so
  `mayRevealCode()` returns false for it *everywhere*, local included. A
  developer working offline still wants `demo.kima.cm` or `example.*` on their
  local rows; the team mailbox belongs on the shared demo, not in
  `.env.local`-land. The two uses are different and should not converge on one
  address list.
- `demo.kima.cm` is hardcoded as undeliverable in `isUndeliverableAddress()`. If
  that domain is ever given a real mailbox, the code list has to change in the
  same commit, or a real inbox silently becomes one whose codes are printed on
  screen.

`supabase/seed/synthetic.sql` keeps `@example.invalid`, which cannot receive mail
by IANA reservation, so running the seed can never mail a real person by
accident. Substituting the team mailbox is a deliberate edit for a shared demo,
not the default.

### Testing the pure engines

```bash
npm test
```

`scripts/engine-check.mjs` compiles the engines with `--strict` into a scratch
directory and runs Node assertions (rule activation, proposeCases, permissions,
command layer, three verdicts, fee ledger, engagements, vault) and the P0 checks
T-16 … T-20: `CLIENT_EVENT_KINDS` equals the SQL `client_may_record()` list read from
the migrations, no stage × filing combination shows "Complete" unless the filing is
verified, `canDeliver`, the code-reveal rule, and a reported-only fee is never
"Paid". CI runs the same command. The SQL negative tests (T-01 … T-14) are pgTAP files
in `supabase/tests/`, run by the verify workflow with `supabase test db`. **Add
assertions with every rule or permission change.** Expanding coverage toward the earlier F2–F4
counts remains open work.

```bash
npm run test:journey
```

`scripts/journey-check.mjs` does the same for the incident prototype
(`lib/incidents.ts`, `lib/next-best-action.ts`, fixtures F-1…F-4 in
`lib/mocks/incidents.ts`): test-protocol A-2 (no `verified` without official
evidence; a debit never reaches `verified`), A-7 (exactly one next action, each
with a verified source or the "not yet confirmed — ask your tax centre"
fallback), A-8 (never suggests paying again while a debit is unresolved),
"a taxpayer can never set verified or resolved", and the owner decisions of
27 Oct: D4 (a `payment_step_error` incident that shows a debit becomes
`debit_not_recognised`, with exactly one `incident_type_changed` event, and
cannot then be resolved until a reviewer verifies the payment) and D5 (no
waiting period before `disputed`; no next action or prototype string shows a
number of days). Each check counts its own assertions and fails if none ran.
CI runs it on every push (`.github/workflows/ci.yml`, Agent A's).

**Registration privacy (Phase 2 / OD-5).** Public registrations are visible
to an accounting firm only when `organization_id` names that firm and the
member holds the required capability. Unassigned applications are **not**
a shared firm queue and cannot be claimed by whichever firm arrives first.
A legacy unassigned production registration still needs an explicit routing
or closure decision; this change does not alter that row.

**Suspension is enforced across all firm identity helpers (R-57).** Alongside
the original tenant-scoped access checks, the older `firm_member_has()`,
`current_member_id()` and `current_member_label()` now deny access for
a suspended firm. A firm's own access returns only after authorized
unsuspension; its clients remain able to view their own files.

**Firm sign-up name hygiene (Phase 2 / OD-2).** A new accounting firm name
will use a deterministic collision key (case, accents, punctuation, spacing
and legal-form labels ignored) to refuse look-alike names. This is not an
official registration or ONECCA format check. Draft D2 (#46) adds an
atomic, verified-email `sign_up_firm()` RPC: it creates the unverified firm,
its partner and an audit record, but `allow_firm_signup` defaults OFF until
owner-approved release. No production sign-up is enabled.

### Two synthetic tenants

Isolation cannot be asserted against one tenant, so there is a seed that creates
two. It is **not** a migration and must never be moved into
`supabase/migrations/`, because the production migration job can apply that
directory **only after both `CI` and `Verify migrations` have passed for the
exact current `main` commit**.
Obsolete runs skip and manual deployment dispatch is disabled; retry a failed
migration by rerunning the `main` workflows. This seed refuses to run without an explicit session
setting, and every name, NIU and amount in it is invented.

```bash
psql "$LOCAL_DATABASE_URL" \
  -c "set kima.allow_synthetic_seed = 'yes'" \
  -f supabase/seed/synthetic.sql

KIMA_ALLOW_SYNTHETIC_SEED=yes npm run seed:storage
```

Two firms, two taxpayers, an engagement each and no cross link; cases, requests,
one uploaded document, messages and the `case_events` history behind them. Every
member and contact is bound to an `auth.users` row, because `member_has()` and
`can_see_taxpayer()` answer for `auth.uid()`: without that binding the firms
exist and nobody can act as them. The addresses are `@example.invalid`, which
cannot receive mail, so signing in through the browser needs a local stack with
`KIMA_DEMO_OTP_REVEAL=1` or a real address put in place of one of them.

The second command is separate because object bytes live in the storage service,
not in Postgres: `scripts/seed-storage.mjs` uploads a generated one-page PDF per
seeded document and writes the real `byte_size` and `sha256` back onto the row.
Storage paths start with the taxpayer id and have to —
`storage_path_taxpayer(name)` reads the first segment, and anything else makes
the file unreadable to the client who uploaded it and to their own firm.

None of this proves the upload loop. No client has yet put a file there through
the UI; that is phase 5 of
`docs/strategy/2026-10-29-qa-and-adoption/plan.md`.

### Verifying UI

`tsc` and `next build` green, then check both locales at 375 / 768 / 1024 /
1440. Non-negotiables: 4.5:1 text contrast, visible 3px focus rings, 44×44px
touch targets, `prefers-reduced-motion` respected, SVG icons and never emoji.

---

## Design

The owner-decided palette in
`docs/strategy/2026-10-29-qa-and-adoption/plan.md` §4.5 is the authority: navy
`#18243B`, indigo `#455DA8`, background `#F7F9FC`, border `#DCE3EC`, body
`#273248`, success `#15803D`, with warning and error reserved for genuine
attention states. Tokens live in `app/globals.css` as CSS variables, so light
and dark swap without touching component code.

**Brand (owner decision D8, 27 Oct 2026).** The company is **KIMA CONSULTING** and
the product name in the interface is **KIMA OS**. The official lockups live in
`public/brand/`: `logo-color.svg` (light surfaces), `logo-white.svg` (navy and
dark surfaces), `logo-charcoal.svg` (light, gold accent in the A), the square
marks `mark-color.svg` / `mark-white.svg` / `mark-charcoal.svg`, and PNG
exports of each. `app/icon.svg` (same art as `public/brand/app-icon.svg`) is the
favicon; `public/logo.svg` keeps the colour mark at the old path. Light chrome
switches between the colour and white marks with `.brand-mark-light` /
`.brand-mark-dark` in `app/globals.css`. The old intelligent-K files
(`logo-horizontal`, `logo-dark`, `logo-mono`) are gone; do not reintroduce them.
The mails use the same names: subjects start "KIMA OS —", the signature is
"— KIMA CONSULTING", and the default sender (when `KIMA_MAIL_FROM` is unset) is
`KIMA CONSULTING <onboarding@resend.dev>`. `lib/auth-mail.ts`, `app/api/inquiry/route.ts`
and the `auth-codes` Edge Function carry identical strings, so a sign-in code reads the
same whichever path sent it.

Indigo `#455DA8` carries white text at 6.2:1 and success `#15803D` carries
white or light-surface text at 5.0:1. Amber remains an attention colour whose
darkened variant carries text. Never use a fill-only colour for text.

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
| A fee payment is never confirmed without a reference, a person and a time | `confirmed_requires_evidence` |
| A client may report a fee payment only as `pending_confirmation`, for an issued invoice of their own taxpayer, and reads only their own payments | policies `client reports fee payments`, `client reads own payments` |
| A confirmed or rejected fee payment is final; a review changes only status and confirmation, and the database stamps who confirmed and when | trigger `service_payment_review_guard` |

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

### What the public site offers (Phase 2)

`OPEN_WORKSPACE_KINDS` decides what the home page offers, and it is still
`individual` and `business` — **the accounting-firm plan exists in the copy and
is not rendered.** It appears the moment that constant admits
`accounting_firm`, which is the last step of phase 2 and happens only after two
firms have been tested side by side.

The pricing section pairs each plan to its workspace **by kind**. It used to
walk `OPEN_WORKSPACE_KINDS` and take `t.pricing[i]`, which worked only while
both arrays began with the same two entries in the same order; the third plan
was simply never reached, and reordering either array would have rendered one
plan's words under another plan's link.

The firm plan's copy said *"activation goes through a review"*. That was true of
the design Agent A proposed and false of the one the owner chose on 30 Oct: it
now says the workspace opens at sign-up and stays marked **unverified** until
KIMA checks the registration number, which is the safeguard that replaced the
review.

`npm run test:marketing` holds both: every plan must name its kind, the two
locales must list the same kinds in the same order, the home page must filter
rather than pair by position, and the firm plan must not promise a review. It
also asserts the disclaimer that **no tax-authority authorization, partnership
or e-filing integration is established or claimed** is still present in both
locales — a hard constraint, asserted rather than trusted.

### Firm staff management (Phase 2)

A firm partner invites, re-roles and revokes their own staff through one
database function, `public.manage_firm_staff()`. There is no generic
`firm_members` write policy and none is added: the table stays fail-closed and
that function is the only route.

What it will not do, by construction rather than by convention:

| | |
|---|---|
| Grant `firm_partner` or `kima_admin` | refused — a partner cannot mint another partner or a KIMA administrator |
| Reach another firm's staff | the caller's organisation comes from their own bound membership, never from an argument |
| Act for a suspended firm | the partner check resolves through the access helpers, which exclude a suspended organisation |
| Send email | nothing is sent from the database; the invitation email is a separate change |

Every invite, role change and revocation appends an audit event.

**A staff email is globally unique**, because `firm_issue_code()` selects a
member by email — two rows sharing one address would make sign-in ambiguous. The
migration checks for duplicates before it creates that index and refuses with
the count and every colliding address. Correct or clear a stale email
while retaining the membership record; deactivation alone does not satisfy the
index predicate. Never silently rewrite another member's address. Production was re-checked before release:
3 member rows, 3 with an email, 3 distinct, 0 duplicate groups.

**Still outstanding:** the staff screens themselves. The function and its rules
exist and are tested; there is no interface for a partner to use them yet, so
staff management is reachable only through the RPC. That UI is Agent B's, and
phase 2 is not done without it.

### Approving an application (Phase 2)

An accountant approves an application through one database function,
`public.approve_registration()`, and it writes the whole client file or none of
it: the taxpayer, its engagement, the contact, the account link that is the
client's own route in, a portal account, the decision on the `registrations`
row and the audit entry — one transaction, inside the approver's own firm.

`SECURITY INVOKER`, so every policy still applies to every statement; every
table it touches already had an INSERT policy a firm member can satisfy, so it
added no policy and no new definer surface.

Three outcomes:

| Outcome | |
|---|---|
| `approved` | the client file exists and the application is decided |
| `already_registered` | the declared NIU is already a client of KIMA, so a draft engagement is recorded for that client to accept and **nothing is approved** — one NIU is one client |
| `already_approved` | returns the existing file rather than raising, so a double click is not an error and never a second taxpayer |

**Approval does not give the taxpayer portal access.** The portal account is
created `pending`, and `portal_request_code()` refuses a non-active account, so
no sign-in code can be issued against it. Activating sign-in is a statement that
this person holds this identifier; a firm clicking approve is not that, and
phase 3's invitations are where activation belongs. T-250 asserts the refusal
from the product's side, so changing `pending` to `active` fails a test rather
than quietly handing out access.

An application with **no declared NIU** gets no portal account at all, and the
audit entry says so. `portal_accounts.identifier` *is* the NIU, `NOT NULL` and
`UNIQUE` — a blank would collide with the next one and an invented one would sit
in the table looking like an account.

### Staff workspace (Phase 2, behind release gate)

The bilingual `/fr/workspace/staff` and `/en/workspace/staff` routes display
only the firm's RLS-visible members. Active partners can invite staff or
reviewers, change those two roles, and revoke access via the audited
`manage_firm_staff()` RPC; no direct member writes or privilege elevation.
Invitations do not send email. Staff screens remain unmerged until owner
approval, staging isolation checks, and final Phase 2 review.

## Where the work stands

**Status, 29 October 2026: not client-ready.** The QA and adoption plan in
`docs/strategy/2026-10-29-qa-and-adoption/plan.md` scores safety and honesty 7/10 and
end-to-end loops 5/10. **No real taxpayer data may be loaded** until its phases 1, 2 and 7
are complete and the owner has approved. The shared document loop has never carried a real
file; firm self-sign-up, per-firm isolation (`member_has()` is still firm-wide) and the
two-firm isolation test are launch blockers. That plan is the controlling roadmap, and
`docs/strategy/2026-10-27-taxpayer-first/backlog.md` carries the per-item statuses.

**Fee payments: clients report, the firm confirms (27 Oct 2026, Agent A, owner D6 and
D2).** A signed-in client can now report a payment of KIMA's own fees from
`/app/payments` (`components/live/payments-panel.tsx`). The row lands as
`pending_confirmation` / `reported_by = 'taxpayer'` and reads "Paiement signalé — à
confirmer", never "Paid". RLS refuses a report on another taxpayer's invoice, on a draft
invoice, with any confirmation field, or backdated. A client reads only their own
payments. A partner (`billing.manage`) confirms or rejects once. After that the payment is
final, and the database writes the confirmer's name and the time (migrations
`20261027210000`, `20261027210100`; tests `supabase/tests/fee_payments_test.sql`, engine
check T-21). Staff can record a payment only as the firm, and only as pending.
**Organisation scoping is merged and applied** (PR #22, migration
`20261029213000`, production 30 Oct 2026 02:42 UTC): `member_has(cap, taxpayer_id)` requires an accepted, unrevoked
engagement between the caller's organisation and that taxpayer, and the fee-payment
policies pass the row's taxpayer like every other. A draft engagement grants nothing, and
setting `revoked_at` removes access on the next call. Rows a firm owns rather than a
taxpayer (its engagements, its contacts, applications it has taken) go through
`member_has_in_org(cap, organization_id)` instead, and a public application that belongs
to no firm yet stays visible to firm members who work client files until one of them
claims it. `supabase/tests/two_firm_isolation_test.sql` holds the 37 pgTAP checks that
gate it, and R-47 is closed: a second firm is no longer blocked by scoping (backlog
P2-5, owner D7). Review of #6:
`docs/agents/handoffs/2026-10-27-a-review-of-pr6.md`. auth-codes version history:
`docs/deployment.md`.

**An engagement is not something a firm can write itself** (migration
`20261030070000`, risk R-51). Scoping a firm's reach to its own engagement is only
half of tenant isolation; the other half is who may create the engagement. Until this
migration the INSERT policy asked only for `engagement.create` in the row's own
organisation, `status` defaulted to `'authorized'` and `authorized_at` to `now()`, so a
single INSERT naming any taxpayer id produced a live grant and opened that taxpayer's
whole file. Reproduced on a replayed database before it was fixed: the insert raised
nothing, and the next read returned Firm B's taxpayer to Firm A. Four rules now hold, and
`private.engagements_grant_guard()` carries the three that RLS cannot see because they
are about a transition rather than a row:

1. An engagement **opens as a draft**. The `status` default is `'draft'`, `authorized_at`
   has no default, and an INSERT that names a granting status is refused — so the
   two-step draft-then-authorise route is closed with the one-step one.
2. **Only the taxpayer records acceptance.** `accepted_at` is writable by the taxpayer's
   own session and by nobody else, and once written it cannot be changed or cleared.
   `"client accepts engagements"` is the policy that lets them.
3. **A firm authorises alone only for a taxpayer no other firm currently holds**
   (`private.taxpayer_engaged_elsewhere()`). This is what keeps onboarding working: a
   firm that has just created a taxpayer is the only firm engaged with them. With the
   taxpayer's acceptance it may authorise regardless, which is how a second firm joins.
4. An engagement **never moves** between firms or taxpayers, and a revocation is final.

A client's acceptance is narrow, and a firm cannot stand in for it
(`20261030100000`, both found in review of #30 and both reproduced first). The
`"client accepts engagements"` policy checked only that the new status was `accepted`,
so one UPDATE could accept the engagement *and* rewrite `fee_xaf`, `assigned_to` or
`authorized_at` — a client could reprice their own engagement and authorise it. The
guard now allows a client to change `status` and `accepted_at` and nothing else. And a
firm could write `status = 'accepted'` with `accepted_at` left null, so the record
claimed a consent that never happened; `engagements_accepted_needs_a_date` is a CHECK
rather than guard logic, so it binds the service role and migrations too. `'authorized'`
carries no such requirement, and that asymmetry is deliberate: a firm may authorise
alone for a taxpayer no other firm holds.

`supabase/tests/engagement_grant_test.sql` holds 22 checks; ten fail without
`20261030070000` and four more without `20261030100000`. **The residual gap, stated rather than implied:** a firm can still open and
authorise an engagement against a taxpayer that *no* firm holds, without consent. It
cannot learn such a taxpayer's id through the API — it reads no taxpayer it has no
engagement for — so it would have to guess a UUID, but the gap is real and only the phase
3 invitation lifecycle closes it. Carried as R-51.

The same migration fixed a live break: `draftEngagement()` wrote `status: 'pending'`,
which is not one of the six states `engagements_status_known` allows, so every engagement
insert through the onboarding wizard and the engagements screen had been refused since
`20261029213000` merged. `scripts/engine-check.mjs` asserted the wrong value too, which
is why nothing caught it.

**Opening a client file is one act** (migration `20261030110000`, risk R-54). The
onboarding wizard used to perform seven statements from the browser and four of them
were refused, so a firm could not take on a new taxpayer at all. Measured as a signed-in
firm partner against a replayed schema rather than reasoned about: step 2 sent `insert
into taxpayers … returning id`, and Postgres applies the SELECT policy to a row returned
by `RETURNING`, where `can_see_taxpayer(id)` needs a live engagement that cannot exist
one statement before the engagement is written. The error said `new row violates
row-level security policy`, which misleads — `private.member_has('case.advance')` is
true, and the same INSERT without `RETURNING` succeeds. Steps 4 to 7 were then refused
because an engagement opens as a draft and a draft grants nothing, which is the rule that
stops a firm self-granting by drafting against another firm's client (T-74).

On the owner's decision of 30 Oct, opening a file for a brand-new client **authorises**
the engagement. That grants nothing the firm could not grant itself a second later under
rule 3 — no other firm holds a taxpayer created in that same call — and `accepted_at`
stays null, so no client consent is claimed and only the taxpayer can ever write it.
`draftEngagement()`'s "opening a file is not the authorisation" now describes the
engagements screen, where drafting and authorising remain two separate acts.

`public.open_client_file()` creates both rows atomically. It is **SECURITY INVOKER on
purpose**: every policy still applies, so the caller needs `case.advance` to create the
taxpayer and `engagement.authorize` to authorise it, and `engagements_grant_guard()`
still refuses if another firm holds that taxpayer. The engagement is inserted as a draft
and then authorised, because `"firm writes engagements"` deliberately refuses an insert
that is already a grant — the F-01 fix working, not an obstacle to route around. It takes
no taxpayer id and only ever creates one, so it cannot be used to reach an existing
client, and T-53's one-definer-in-`public` invariant is untouched. Being atomic also
removes the orphan risk the old sequence carried: a refused engagement used to leave a
taxpayer nobody could read.

**How this class of defect is caught now.** Three defects reached production on the
onboarding path in one morning, every one found by reading code. The reason was the same
each time: the repository had unit tests over pure functions and pgTAP tests over
hand-written SQL, and nothing that ran the sequence the application actually performs, as
the role it performs it as, against the schema the migrations produce. Two things close
that. The journey test above is one. The other is engine check **T-22**, which parses
`engagements_status_known` out of the migrations and asserts that every status
`lib/engagements.ts` writes is one the database allows — the contract the `'pending'`
defect broke. Reproducing the pre-`20261030070000` state exactly, including the
hardcoded assertion that agreed with the bug, T-22 is what fails:

```
lib/engagements.ts writes status 'pending', which engagements_status_known
does not allow (draft, invited, accepted, authorized, revoked, expired)
```

**The firm staff directory belongs to the firm** (migration `20261030090000`, risk
R-53). `firm_members` carried `POLICY "members are readable" FOR SELECT USING (true)`
with no role named, so every signed-in caller and every anonymous one read every firm's
member rows. The column grants were set deliberately in `20261022163452` and held — a
probe as a signed-in member got `permission denied for table firm_members` on `email`,
and `auth_user_id`, `otp_hash`, `otp_expires_at` and `failed_attempts` are equally
unreadable — so what leaked was the directory, not credentials or client data: id,
organisation, `person_label`, `role`, `active`. The owner's decision on 30 Oct made it a
defect rather than an open question. The policy is now
`organization_id = private.current_member_org()` and names only `authenticated`, so a
caller with no session is refused by having no policy at all, which is an empty result
rather than an error. Seven checks in `supabase/tests/firm_directory_test.sql`, both
directions plus the anonymous case; all seven fail without the migration.

The helper is SECURITY DEFINER because it has to be, not for tidiness: the predicate
reads `firm_members` from inside a policy *on* `firm_members`, and written inline that
raises `infinite recursion detected in policy for relation firm_members`. A definer
helper reads the table as its owner with RLS off, which breaks the cycle.

Tightening it was safe because firm sign-in does not read the table before a session
exists — `/api/firm/request-code` and `/api/firm/verify-code` go through
`firm_issue_code()` and `firm_verify_code()`, both SECURITY DEFINER and reachable only by
the service role or the auth-codes Edge Function, and the route's own `firm_members`
write uses `supabaseAdmin()`, which bypasses RLS. That was checked rather than assumed.

A member with no organisation is now unreadable, including to themselves, because
`organization_id = null` matches nothing. Nothing depended on the old behaviour and T-98
pins the new one, because rows in that shape exist.

The same migration carries a third live break. `components/live/onboarding-wizard.tsx`
resolved the signed-in member's firm with `.eq("auth_user_id", auth.user.id)`, and
`authenticated` holds no SELECT on that column — Postgres requires the privilege for a
column in `WHERE`, not only in the select list, so the query had been failing with
`permission denied for table firm_members` since #13 introduced it on 27 Oct. The intent
was right, replacing an unsafe `organizations … limit(1)`, and it never worked. It now
goes through `current_firm_intake_identity()`, which resolves `auth.uid()` in the
database and returns the organisation without exposing `auth_user_id`.

**The policy helpers are no longer API endpoints** (migration `20261030020000`,
merged in #27 and applied to production 30 Oct 2026). Eleven `SECURITY DEFINER` functions sat in `public`, the
schema PostgREST publishes, so each was an endpoint at `/rest/v1/rpc/<name>` and
seven were callable without signing in. Among them `portal_request_code()`,
which issues a one-time code: an anonymous caller could invalidate a client's
pending code at will and lock the real client out of signing in (risk R-49).
They now live in a `private` schema, which PostgREST does not publish, so they
have no route whatever their privileges. Moving preserves each function's OID, so
the policy expressions that call them keep working untouched.

**Revoking `EXECUTE` is not the fix, and trying it is instructive.** Postgres
checks `EXECUTE` on a function in an RLS policy expression against the *querying*
role, at execution time. The first revision of this migration revoked from
`PUBLIC`, `anon` and `authenticated`, and CI came back with `permission denied
for function client_taxpayer_ids` raised from inside an `insert into documents`
policy, taking six of the P0 write tests with it. A revoke does not close the
endpoint and leave the policy working — it breaks the policy, for every
signed-in user. (It also explains why the three `revoke execute … from anon,
authenticated` lines in `20261029213000` are harmless: those functions were new,
so `PUBLIC` still held the default grant the two roles inherit, and naming the
roles removed nothing. They read as a control and are not one;
`20261030020000` replaces them with explicit grants and says so.)

`supabase/tests/definer_surface_test.sql` holds both halves on every build.
T-51 … T-53 are catalog facts: nothing is left in the published schema, every
moved helper is accounted for, and **exactly one** definer function in `public`
may be executed by `anon` or `authenticated` — so a new definer helper dropped
into `public` fails the build. T-54 … T-60 are live reads down the three call
paths that each reach a different moved helper: a firm member through
`member_has` → `current_firm_role`, a client through `client_taxpayer_ids`, an
anonymous visitor through `flag_enabled` + `demo_taxpayer_id`.

`app_flags` keeps RLS on with no policy, which is deliberate: nothing reads it
through the API, `private.flag_enabled()` reads it as its owner, and a permissive
policy would publish the demo switches to the browser. The table comment says so,
and the advisor's lint 0008 on it is expected.

The one exposure that stays is `can_write_client_note(taxpayer_id)`, granted to
`authenticated` only. `/api/inquiry` has to know whether the caller may write a
client-visible note *before* it sends mail, since a write refused afterwards
would leave a client emailed with no record of it. It answers about the caller
alone and returns a boolean, never a row. That route no longer calls
`member_has()` or `can_see_taxpayer()`: visibility is now a scoped read of
`taxpayers` under the caller's own session, which is the policy itself.

**P0 security and honesty fixes (27 Oct 2026, merged in #13; migration `20261027120000` applied).** One forward-only
migration (`20261027120000`) scopes storage to the taxpayer segment of the path, limits
what a client may write (`client_may_record()` = `CLIENT_EVENT_KINDS`; no message as
the firm, no non-pending document, only a request's status), refuses delivery without a
verified filing, stops re-issued codes from resetting the failure count, revokes the
verify functions from anon, and keeps one sign-in from being both a client and a firm
member. On screen: statuses read the filing dimension (`clientStatus`, `clientStep`),
"Paid" means confirmed money (`feePaymentState`), client writes use the session's own
taxpayer (`sessionTaxpayerId`) and show refusals, the firm's new-client wizard uses the
member's own organisation and leaves the engagement awaiting authorisation, and sign-in
fails rather than answering ok without a bound session. The `auth-codes` Edge Function
source is now in `supabase/functions/`; it is **deployed as v5** (version history in `docs/deployment.md`)
(`docs/deployment.md`). Contract for Agent B:
`docs/agents/handoffs/2026-10-27-a-to-b-p0-contract.md`.

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

**Audit (27 Oct 2026).** `docs/audits/2026-10-27-taxdome-parity/` finds that nothing is yet end-to-end WORKING (engines are; no DB or E2E tests), that firms cannot create cases, tasks, contacts or invoices and registered taxpayers cannot get a sign-in, and that **production migrations have failed since 23 Oct** The drift was repaired by #6 (merged 27 Oct, ratified after the fact as owner decision D2); the migration pipeline has run green since. The audit's other findings stand.

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
  the `allow_demo_anon` row in `app_flags` is true — **and it is false on
  production since 30 Oct 2026, 02:13 UTC**, so a visitor who is not signed in
  now reads no taxpayer at all. See "Phase 1 environment settings".
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
in `.env.local`. Without it `/api/firm/request-code` answers 503, no session can
be minted, and every write is correctly refused. On Vercel it **is** set, for
every environment, and has been since 23 Oct 2026 — an earlier version of this
paragraph said otherwise and was wrong. Vercel hides the value, so what is
confirmed is that the variable exists, not that it holds the current key.
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
  unless the `allow_demo_anon` row in `app_flags` is true, and that row is false
  on production since 30 Oct 2026

## Phase 2 firm signup review preview (not publicly enabled)

The ordinary public onboarding for taxpayers remains unchanged. For a **local or Vercel preview** build only, set `KIMA_FIRM_SIGNUP_PREVIEW=1` and visit `/fr/register?type=accounting_firm` or `/en/register?type=accounting_firm`. Without that flag the firm route is 404; Vercel production always returns 404 even if the flag is set. The route renders a **clearly identified mock**: no OTP or firm is created.

Only for an independently isolated staging Supabase project (not `vhrnrbnjhmxrygvyfirf`), set `KIMA_FIRM_SIGNUP_STAGING=1` in addition to the preview flag to exercise the real Supabase Auth OTP adapter (#43) and atomic database RPC (#46). Configure the staging email template with `{{ .Token }}`; verify Auth OTP expiry, resend limits and rate limits. Keep `app_flags.allow_firm_signup=false` everywhere until a reviewed staging test explicitly enables it on **staging only**. The UI never sets that flag. Preview deployments currently point at production; **do not enable staging mode on a production-connected preview.** After owner approval and schema-first release, entrypoint activation is a separate release-gated change.

Public individual/business intake offers an optional receiving-firm choice from `firm_directory()`, showing KIMA's registration-number check status but making no professional-credential claim. Owner decision, 31 Oct 2026: choosing a firm is not a submit requirement. An application sent without one stores `organization_id` as NULL and, under the organization-scoped registrations RLS (#42), stays invisible to every firm — held for explicit routing, never silently assigned. That routing path is follow-up work, tracked openly rather than faked.

General KIMA contact submissions now use `contact_inquiries` rather than unassigned `registrations` records. The dedicated schema in #51 **must** be released before this UI change; normal individual/business onboarding keeps the receiving-firm choice optional and never silently routes an application to an unrelated practice.

### Contact inquiries versus firm-scoped applications (Phase 2)

A general public contact request goes to `public.contact_inquiries`, an append-only, non-tenant inbox readable only by an active authenticated KIMA administrator. This is **not** a `registrations` row and creates no organization, client, or firm authorization. An ordinary onboarding application may name a receiving firm — its row is then visible only to that firm under #42 — or stay unassigned, invisible to all firms until explicit routing. The contact page UI is a separate Agent B change; deploy the table before the UI in the owner-approved release.

A visitor may write only the message fields (`contact_name`, `contact_email`, `contact_phone`, `inquiry_kind`, `preferred_language`, `note`). `id` and `received_at` are not granted, so a submitter can neither choose their own primary key nor backdate when KIMA received the message (T-232 .. T-234).

**Release gate: direct Data API writes are OFF.** `app_flags.allow_public_contact_inquiries` defaults to `false`; the INSERT RLS policy refuses anonymous and authenticated submissions until this separate flag is explicitly enabled. This matters because PostgREST exposes the table independently of any Next.js route, so a route-only throttle or captcha cannot secure direct REST writes. Keep the flag OFF until abuse protection covers the Data API path and the owner approves activation. The synthetic pgTAP test temporarily enables the flag inside a rolled-back transaction; it does not activate production.

KIMA administrator safeguard (review branch): `admin_review_firm(firm_uuid, 'verify'|'suspend'|'unsuspend', reason)` is an audited privileged RPC limited to an active Auth-bound `kima_admin` of a `kind='kima'` organization. It changes only accounting firms, requires a documented reason, and never certifies professional qualifications. No public organization UPDATE permission is granted; operator provisioning and live activation require explicit owner approval. Synthetic pgTAP covers denied callers and the two-firm signup isolation path.
