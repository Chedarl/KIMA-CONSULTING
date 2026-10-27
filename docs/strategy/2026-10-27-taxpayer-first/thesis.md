# A — Product thesis and non-goals

## 1. The thesis in one paragraph

A Cameroonian taxpayer — a Douala trader on the IGS, a SARL, an individual filing IRPP —
should be able to answer, at any moment and per obligation: **what applies to me, what
must I do next and why, what is blocking me, what will it cost, what evidence proves it
is done, and what is still unresolved.** Today the DGI's portals answer none of these
when they fail, and the taxpayer is left holding a debit SMS, a screenshot and no idea
whether they are compliant. KIMA keeps that record honestly — separating what the
taxpayer *did*, what the administration *acknowledged*, what was *paid*, and what was
*certified* — and puts a qualified professional on the one step that changes legal
status.

That is consistent with the thesis already in the README (TADAT 2025: e-filing channel
scored **A**, on-time filing **C**, accuracy verification **D** — the state solved the
channel, not compliance). The brief adds the second half: the channel itself fails, and
nobody holds the taxpayer's side of the record when it does.

## 2. Why each proposed feature exists — problem first

| Documented problem (status of the evidence) | Feature | Who controls the fix |
|---|---|---|
| Portal inaccessible / payment stage fails near the deadline (press reports May–Oct 2026; survey Apr 2025: 59.5% dissatisfied, n = 1,159 — *reported figures, not KIMA demand*) | **Incident record**: what was attempted, when (Africa/Douala), on which portal, what the screen said, with evidence | DGI controls the portal. KIMA controls only the record and the next-step guidance |
| Wallet debited, DGI shows unpaid (individual public posts, Oct 2026 — *anecdotal*) | **Payment states that never collapse**: debit observed ≠ reference held ≠ DGI receipt ≠ disputed | DGI / Trésor reconcile. KIMA preserves evidence and tracks the dispute |
| Filed and paid, ACF still refused (one public post, Sep 2026 — *anecdotal*) | **Certificate status** as its own dimension, plus a support-ready case file | DGI issues the ACF. KIMA never creates or imitates one |
| "Uncertain processing and inadequate guidance" (public post, Jun 2026) | **One next best action**, in plain French/English, linked to its official source or labelled unverified | KIMA, but only from verified rules |
| Taxpayer cannot tell "attempted" from "submitted" from "paid" | **Five statuses on screen, never one green badge** | KIMA |

Evidence quality is weak: press reports and individual posts, no longitudinal data, no
KIMA user research. That is why `test-protocol.md` exists and why nothing here claims
demand.

## 3. How the brief fits the blueprint (the owner kept the blueprint)

The brief says a taxpayer "must not be forced into an accountant-led workflow at
registration". The blueprint, which `CLAUDE.md` says wins, defines Kima Client with an
**assigned accountant** (blueprint §7.1) and requires **professional review for legally
consequential calculations and submissions** (§20 rule 11). The owner chose to keep the
blueprint. The reconciliation:

| The taxpayer may, alone | Only a reviewer may |
|---|---|
| Register, without choosing a firm | Move filing, tax payment or certificate to **verified** |
| See their obligations (only those from verified rules) | Approve a declaration or amount |
| Record an incident and attach evidence | Decide a document's three verdicts |
| Record what they did and saw — *as assertions* | Close a dispute as resolved |
| Export their own case file | |

Everything a taxpayer records is a **declared** claim (the `declared_*` convention in
`lib/registration.ts`), shown as "you reported", never as confirmed. Where the brief's
wording goes further — "taxpayers may self-file" as a KIMA-supported end state with no
professional — **it is outside the blueprint and is not proposed.** The taxpayer can
always file on the DGI's own portal; KIMA does not pretend to verify that without a
reviewer.

## 4. Non-goals (explicit)

- **No automated DGI filing or payment**, no scripted login, no stored DGI credentials,
  no "connected to Harmony" language (`harmony2-dgi-platform-research.md` §5).
- **No ACF look-alike.** The exported case file is a private record: no seal, no QR, no
  "conformité" wording, a visible "this is not an Attestation de Conformité Fiscale"
  line, and a link to the real ACF service. (Decision carried from the 22 Oct plan.)
- **No promise of relief** — penalties, deadline extensions, refunds. A deadline-risk
  warning may be shown; an outcome may not.
- **No advice to pay twice.** When a debit is not recognised, the guidance is to hold
  evidence and escalate, not to retry payment, unless a verified official source says
  otherwise.
- **No obligation from an unverified rule.** Today that means an IGS taxpayer sees *no*
  active IGS obligation (`IGS_QUARTERLY` is `inferred`, `lib/rules.ts:577-596`). That
  is the constraint working; the fix is source verification, not activation.
- **No AI tax advice**, no tax optimisation, no country expansion in this iteration.
  Owner answer 3 adds plain-language bulletins built from official texts (P1-9). A
  machine may *draft* a summary for the reviewer; only an expert-comptable's approved
  text, linked to the original document, ever reaches a taxpayer. A bulletin informs —
  it never creates an obligation; obligations still come only from `verified` rules.

## 5. TaxDome — hypotheses, not claims

TaxDome (taxdome.com/overview) offers a firm CRM, client portal, pipelines, document
requests and messaging. KIMA borrows those patterns (`portal-patterns-research.md`). The
differentiators below are **positioning hypotheses to test**, not a claim that no
competitor has them; TaxDome's current feature set must be re-checked before any public
comparison.

| Dimension | TaxDome pattern | KIMA hypothesis |
|---|---|---|
| Entry | Firm invites the client | Taxpayer can register alone (reviewer assigned later) |
| Unit of work | Firm job in a pipeline | One obligation × one period, generated from verified rules |
| Documents | Collect and approve | Three verdicts per document, with the reason |
| Status | Firm progress | Five evidence-backed dimensions, never collapsed |
| Failure | Messaging | Structured incident record and case file |
| Jurisdiction | Generic | Cameroon rule pack with sources and verification status |
