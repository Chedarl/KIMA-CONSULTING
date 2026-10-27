# Product alignment — is KIMA building the right thing?

*Agent A's view on positioning, for reconciliation with Agent B (who owns product
conclusions). Grounded in the code at `main` @ `26d1ac7`, the blueprint, and the owner's
27 Oct decisions.*

## 1. The three capabilities the owner wants in one product

| Capability | Where KIMA is | Assessment |
|---|---|---|
| **Practice management** (TaxDome-like) | Strong data model and engines (cases, permissions, review, events); thin *write* surface. Firms cannot yet create a case, a task, a contact, an invoice or a team member from the product | Architecturally on the right track; functionally a demonstrator over seeded data |
| **Tax compliance intelligence** | Rule registry with source status, prorogations, evidence-gated filing, three verdicts, separation of duties | The real differentiator, and the most mature code. Its output is limited by **content**: 1 of 14 rules verified |
| **Taxpayer self-service and recovery** | Designed in detail (`docs/strategy/2026-10-27-taxpayer-first/`), not built. A taxpayer cannot yet get from registration to a working sign-in | Not yet a product; depends on P0 and on conversion and incident work |

## 2. Is it TaxDome-like?

**In shape, yes. In function, not yet.**

- **The shape matches:** CRM → onboarding → portal → document requests → pipeline →
  review → messaging → billing. The same objects exist, under KIMA names (taxpayer ≈
  account, compliance case ≈ job, case task ≈ task, document request ≈ client request).
- **The function does not yet match** in the parts that make TaxDome valuable day to
  day: work creation, recurrence, automation, invoicing, e-signature and team
  administration. Those are missing writes and schedulers, not missing architecture.
- **It should not try to match** TaxDome's US tax-prep specifics (IRS transcripts,
  Form 8879, KBA) or claim certifications it does not hold (SOC 2).

## 3. Principles checked against the code

| Principle | Held in code? | Note |
|---|---|---|
| Cameroon-first, CEMAC-ready | Yes | Jurisdiction packs in `rules.ts` |
| French and English | Yes | Typed dictionaries (`en: typeof fr`) |
| Mobile-first, low bandwidth | Partly | Responsive; no slow-network budget or capture measured |
| Taxpayer and firm on shared records | Yes, by design | Blocked in practice by storage (#1) and by the missing portal-account creation |
| Official-source verification before activating rules | **Yes** | Unverified ⇒ inactive by construction |
| No invented obligations or deadlines | **Yes** | — |
| No false DGI-integration claim | Yes | Email footer and copy say so |
| No automatic confirmation of filing or payment without evidence | Filing yes (DB CHECK). **Payment: no rule exists, and events are forgeable** | P0 (#2) and P1-1 |
| Professional verification for consequential decisions | Partly | A role, not yet a credentialed expert-comptable (P1-8) |
| Taxpayer-controlled reporting of incidents | Not built | P1-2 |

## 4. Risks to the positioning

1. **The demo outruns the backend.** Several screens imply actions the database
   refuses (`user-journey-gaps.md`, last section). For a product whose promise is
   honesty, that is the most damaging kind of defect. Fix it before any new screen.
2. **Content is the bottleneck for the differentiator.** Without verified IGS and DSF
   rules, the compliance engine shows nothing to the target taxpayer. The
   official-text register (P1-9a) is a content pipeline, not a feature, and should be
   staffed as one.
3. **Multi-firm is a different product.** TaxDome sells to many firms. KIMA today is
   one practice's system. Organisation scoping (P2-5) is the line between the two;
   the owner should decide when to cross it.
4. **Two agents, one schema.** Agent B building incident screens against a schema
   Agent A has not yet written is how contracts drift. The contract is in
   `security-and-integrity-review.md` and the strategy folder's backlog; Agent B
   mocks against it, and Agent A writes it.

## 5. Recommendation on positioning

Lead with what TaxDome does not do: **verified Cameroon obligations, evidence-gated
statuses, and recovery when the DGI's systems fail**. Build only the TaxDome-style
practice features that those workflows need, in the order the journeys need them
(conversion, case creation, tasks, invoicing). Defer automation, e-signature,
integrations and multi-firm until a firm other than KIMA asks for them.
