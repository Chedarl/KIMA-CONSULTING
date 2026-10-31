# KIMA OS

Tax compliance management, accounting workflow automation and digital taxpayer
services. Initial market Cameroon, expansion CEMAC. Currency XAF. French and
English at launch. Company: KIMA CONSULTING. Product: KIMA OS (owner decision D8).

**Tagline (canonical, confirmed 2026-10-20):**
- EN: **Clear Records. Confident Compliance.**
- FR: **Vos comptes en ordre. Vos obligations maîtrisées.**

The brand-concept alternative "Tax Clarity. Business Confidence." was considered and
**rejected**. Do not reintroduce it.

## Baseline document

`docs/blueprint/kima-compliance-os-blueprint-v1.0.md` is the product baseline —
the owner's Business Concept Note, Product Requirements & AI Development
Blueprint v1.0. Read it before proposing or building anything. Where this file
and the blueprint disagree, the blueprint wins.

Six product areas: **Kima Client** (taxpayer portal), **Kima Workspace**
(accountant OS), **Kima DSF Bridge** (Sage/Excel import to DSF preparation),
**Kima Compliance Radar** (obligations and deadlines), **Kima Clarity AI**
(constrained bilingual assistant), **Kima Evidence Vault** (archive).

## Foundation documents

Phase 1 deliverables live in `docs/foundation/`:

- `sitemap.md` — deliverable C: every route, four trust boundaries, locale parity
- `erd.md` — deliverable E: the thirty entities, the scoping model, the two-status decision
- `permissions-matrix.md` — deliverable F: roles, conditions, required negative tests
- `risk-register.md` — deliverable I: thirty-nine risks with phase gates
- `portal-patterns-research.md` — how PwC Connect, Engagement Center, EY Canvas, KPMG
  Clara and the mid-market tools model client work, and what Kima adopts or rejects
- `sage-dsf-ingestion-research.md` — Sage export formats, DSF workbooks, intake channels and
  parsing rules, with every claim labelled VERIFIED / INFERRED / UNKNOWN
- `practitioner-notes-2026-10-21.md` — the second Irina session: document acceptance as
  three verdicts, the regimes, the deadlines, and the client-portal structure. Every claim
  labelled, and the four conflations it exposed
- `cameroon-rule-corpus-research.md` — the rule corpus with legal sources, effective dates
  and verification status. **Read before touching any rule.** Most of it is `inferred` and
  therefore inactive, which is the constraint working, not a gap to fill
- `harmony2-dgi-platform-research.md` — the DGI's Harmony 2 platform: the portal map, what
  it streamlines, and the line between retrieving a document and claiming an integration

`docs/strategy/2026-10-27-taxpayer-first/` answers the owner's 27 Oct taxpayer-first
brief (gap matrix, journeys, backlog, sources, test protocol). It is a **proposal**: do
not build its items until the owner approves it. The owner kept the blueprint — a
taxpayer may start alone and *declare* what happened; only a reviewer moves filing,
tax payment or certificate to `verified`.

**Agents (27 Oct 2026).** Work is split between Agent A (security and data), Agent B
(taxpayer journey) and a chief of staff, all Claude Code subagents in `.claude/agents/`.
`AGENTS.md` sets who may write which path, the current approval gate and the handoff
protocol. Read it before any change.

Still outstanding from blueprint §20: A (software PRD), B (backlog with acceptance
tests), D (journey diagrams), G (component UI/UX specification), H (technical
architecture and API plan), J (phased implementation plan).

## Deployment

`docs/deployment.md` is the deployment reference — read it before changing
anything under `.github/workflows/` or `supabase/`.

Vercel deploys code through its own Git integration (`main` → production, any
other branch → preview). **Never add a Vercel deploy step to a GitHub Actions
workflow** — it would deploy twice and race over the alias.

Database schema reaches production only through forward-only migrations in
`supabase/migrations/`, verified on every PR and applied on push to `main`.
Production is Supabase project ref `vhrnrbnjhmxrygvyfirf`, region `eu-west-3`.

Two standing caveats that follow from the hard constraints below: migrations are
irreversible and the current plan has no point-in-time recovery, and preview
deployments currently point at the production database. Both are recorded in
`docs/deployment.md` and must be resolved before real taxpayer data lands.

## Hard constraints — do not violate

These come from the blueprint and are not negotiable for convenience:

- **Never invent regulatory rules.** Every tax rule carries a legal source,
  jurisdiction, effective date and verification status. Unverified rules stay
  inactive.
- **Never claim government integration.** No DGI API access, e-filing
  capability, authorization or partnership may be represented as established
  without written verification.
- **Four axes, never collapsed:** taxpayer type (who they are — known at sign-up,
  drives the portal), tax regime (réel or IGS — drives *which* obligations exist),
  tax centre (DGE / CIME / CDI — drives *when* the DSF is due), accounting framework
  (drives the DSF template). They correlate strongly. "IGS files on 15 May" is right
  in practice and wrong in mechanism; the centre governs the date. See
  `practitioner-notes-2026-10-21.md` §3.
- **The impôt libératoire and the régime simplifié are abolished** — replaced by the
  **IGS** (Impôt Général Synthétique) under the 2025 Finance Law. Never offer either as
  a current choice. They stay selectable for historical periods only, via `effective_to`
  in `lib/rules.ts`.
- **A statutory deadline is not a fixed date.** Ministerial prorogations are routine
  under art. 16 LF 2025. Resolve dates through `lib/rules.ts`, which reports whether a
  date is statutory or prorogued and whether it can be relied on at all.
- **A document carries three verdicts, not one** — accounting, charge deductibility, VAT
  recovery — and they may disagree. A failed accounting verdict never discards the
  document: it is recorded with its defect stated.
- **Tax regime is not the DSF accounting format.** Model them separately. The
  system normal and the minimum cash-basis system (SMT) are not interchangeable
  labels for the real and simplified tax regimes. Do not infer a filing
  obligation from turnover alone.
- **A declaration is never "filed" because someone clicked a button.** Recorded
  filing status requires official submission evidence or an identified
  authorized integration response.
- **Human authorization before any external submission.** AI never approves
  entries, declarations or amounts, and never presents its output as an official
  DGI determination.
- **Tenant isolation is a correctness requirement.** Firm A cannot reach Firm
  B's data; a taxpayer cannot reach another taxpayer's files by guessing IDs or
  URLs. Taxpayer ownership and firm engagement are separate concepts.
- **Money and dates are exact.** Decimal or integer minor units, never floats.
  Unambiguous periods, time zones and regulatory effective dates.
- **Preserve originals.** Imported source files are kept; financial mappings are
  traceable from source to result; approved declarations keep the exact reviewed
  version.
- **Map accounts on the OHADA decimal root, never the full code.** OHADA codification
  stops at four digits and a company chart may legitimately extend past it (`7011781`
  under root `7011`). Longest-root match, 4 digits down to 1; anything unresolved is
  flagged for a human, never defaulted.
- **Kima fills the DGI's own locked DSF workbook** — it does not invent a DSF format.
- **Reviewer access is assignment-scoped.** A pool reviewer holds no engagement and sees
  only the declaration assigned to them, its preparation, findings and cited evidence.
- Distinguish confirmed fact, interview observation, assumption, and
  "needs legal or technical validation". Irina's interview is one data point,
  not market data.

## Design

The owner-decided palette in `docs/strategy/2026-10-29-qa-and-adoption/plan.md`
§4.5 is the design authority: navy `#18243B`, indigo `#455DA8`, background
`#F7F9FC`, border `#DCE3EC`, body `#273248`, success `#15803D`, with warning and
error reserved for genuine attention and warning states. Premium
financial-technology aesthetic, high information density without clutter,
restrained motion, excellent mobile experience on slow connections.

> `docs/design/design-system/kima-consulting/MASTER.md` is **provisional and
> superseded** — it was generated before the blueprint was available, from a
> generic "professional consulting firm" brief, and its palette and typography
> do not match section 9. Regenerate it against the blueprint before building UI.

Use the `ui-ux-pro-max` skill for UI work (installed at user scope):

```
python ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<query>" -d <domain> -n 5
```

Domains: `style`, `color`, `typography`, `landing`, `product`, `ux`, `chart`,
`icons`, `gsap`, `react`, `web`, `google-fonts`. Add `--stack nextjs` for
stack-specific rules. Related skills: `ui-styling`, `design-system`, `brand`.

## UI non-negotiables

- Text contrast >= 4.5:1, light and dark.
- Visible focus rings (3-4px); full keyboard navigation.
- Respect `prefers-reduced-motion`.
- Touch targets >= 44x44px.
- SVG icons (Heroicons / Lucide) — never emojis as icons.
- Verify at 375px, 768px, 1024px, 1440px.
- The interface must visibly distinguish confirmed information, draft
  calculations, estimated risk, and work awaiting review.
- Full French and English parity on every core journey.
