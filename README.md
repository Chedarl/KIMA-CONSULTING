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
| `docs/design/` | Generated design system — **superseded**; it predates the blueprint, and blueprint §9 is the authority |
| `app/`, `components/`, `lib/` | The Next.js application |
| `supabase/` | Backend notes. **The SQL lives in Supabase, not in this repo** — see Backend |

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
| `risk-register.md` | 39 risks with phase gates. **R-36 blocks real taxpayer data** |

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
13 inferred.** Only the patente renewal date is actionable. That ratio is the
constraint working, not a gap to paper over.

---

## Routes

Every route is locale-prefixed; `/` redirects to `/fr`.

| Route | Surface |
|---|---|
| `/fr`, `/en` | Public overview |
| `/fr/register` | **Public application** — four intake paths (online / WhatsApp / agency / referral). The only anonymous write path in the system |
| `/fr/login` | Portal sign-in — name plus taxpayer number (demo posture, see R-36) |
| `/fr/app` | Taxpayer portal — one next action, checklist, progress |
| `/fr/app/{compliance,declarations,documents,messages,payments,archive}` | Client surfaces |
| `/fr/workspace` | Firm workspace — portfolio, intake queue, review gate |
| `/fr/workspace/clients` | Client list and onboarding wizard |
| `/fr/workspace/inbox` | Document inbox **and the three-verdict acceptance panel** |
| `/fr/workspace/filing` | The filing framework — reference builder, folder tree, filename reader |
| `/fr/workspace/{messages,reviews}` | Messaging and approvals |
| `/fr/design` | Design system — tokens, contrast, status honesty, components |

Nav entries marked `ready: false` in `app/[locale]/workspace/layout.tsx` are
visible but disabled on purpose, so the shape of the product stays legible
without pretending the modules exist.

---

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
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

Copy `.env.example` to `.env.local` and fill it in. Four variables:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (read in
`lib/supabase.ts`, which **throws** without them), plus `RESEND_API_KEY` and
`KIMA_MAIL_FROM` for outbound inquiries. `.env.local` is gitignored and its
values are deliberately not reproduced anywhere in the repo.

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

There is no test runner yet. The engines are pure functions, verified by
compiling to a scratch directory and asserting under `node`:

```bash
npx tsc lib/document-naming.ts lib/rules.ts lib/document-review.ts \
  --outDir /tmp/kima-check --module commonjs --target es2020 \
  --moduleResolution node --skipLibCheck
node /tmp/kima-check/<harness>.js
```

67 assertions currently cover the rule packs, deadline resolution,
prorogations, the naming grammar and the three verdicts. The pattern has
already caught two real defects, so keep it: **add assertions with every rule
change.** Promoting these to a real runner is open work.

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

RLS is enabled on every table. The one structural guarantee is a CHECK
constraint: a declaration cannot be recorded as `filed` without its evidence
reference, capture date and source — enforced against a direct SQL write, not
only through the interface.

**The migrations live in Supabase, not in this repo.** Export them into
`supabase/migrations/` before anyone else needs to review the policies: a
policy that is not in version control cannot be reviewed in a pull request.
This is the most important piece of open housekeeping.

---

## Where the work stands

The approved plan is at `~/.claude/plans/i-think-i-have-glowing-quasar.md` on
the owner's machine — ask for a copy if you do not have it.

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

- **F2 Firm case-management engine** — the spine of MVP 1. Cases, stages, owners
  and blockers, generated from verified obligations rather than configured
- **F3 Triage queue** — the firm's side of registration, with the first-response
  target shown at the point of work
- **F4 KPI standard** — `docs/foundation/client-registration-standard.md`, each
  KPI defined once and computed once in the `registration_kpis` view
- **F5 Status tracker and archive** · then mobile capture, Dossier fiscal,
  correction cases, e-invoicing readiness, a Gabon rule pack

**Known open items**

- Export the Supabase migrations into this repo
- **R-36**: portal sign-in uses the taxpayer number as the password. The NIU is
  not a secret — it is on every invoice and is the DGI's own username. This
  blocks real taxpayer data; the fix is a one-time code to the onboarding
  contact address, keeping the number as the identifier
- No test runner; the scratch-compile harnesses above are the current net
- `docs/design/.../MASTER.md` is stale and contradicts blueprint §9
