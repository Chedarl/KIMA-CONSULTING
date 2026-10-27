# Executive summary — KIMA vs TaxDome audit (27 October 2026)

*Agent A (Claude Code), technical lead. Revision audited: `main` @ `26d1ac7`. The
production database was read, never written. Nothing was deployed or merged. Agent B
(Cursor) owns the product-parity and user-journey conclusions; the two reports are
to be reconciled before the final recommendation.*

## Are we actually building a TaxDome-like product?

**In design, yes; in practice, not yet.** KIMA has the same building blocks as TaxDome:
client records, a client portal, document requests, a work pipeline, review, messages
and fees. Its compliance engine goes further than TaxDome for Cameroon: only verified
rules, evidence required before "filed", professional review.

But most of these blocks can only display data that was loaded by hand. **A firm cannot
yet open a case, create a task, add a contact, issue an invoice or add a team member.**
**A taxpayer who registers cannot yet sign in.** Today it is a convincing demonstrator,
not a working system.

## Which features already work?

Under the strict rule ("works end to end for a real user *and* is covered by meaningful
tests"), **none yet**. What does work reliably:

- **The rule engine.** It shows an obligation only when its official source is
  verified, and it tracks extended deadlines.
- **The case engine.** Stage gates, filing marked verified only with evidence, separation of
  duties between the person who prepares and the person who approves.
- **The three-verdict document review.**
- **Sign-in by one-time code**, for accounts that already exist.
- **Secure messaging.**
- **Access rules** that keep one client's records from another on every table except file storage.

## Which features are incomplete or missing?

- **Incomplete:**
  - turning an application into a client;
  - opening cases;
  - tasks;
  - billing (in PR #6, not merged);
  - engagements;
  - reporting;
  - team administration;
  - the deadline calendar, which is almost empty because only 1 of 14 Cameroon rules is verified.
- **Missing:**
  - automation and reminders;
  - e-signatures;
  - proposals and engagement letters;
  - invoicing;
  - integrations;
  - incident recovery;
  - tax-payment tracking;
  - the official-text news feed.

## Where are the most serious technical risks?

1. ~~**Database updates have not reached production since 23 October.**~~ **Resolved 27 Oct**: PR #6 merged; production is in sync again. The deployment
   pipeline fails on every push, so any fix merged now would not reach production. The repair
   already exists in Cursor's open PR #6.
2. **File storage is open to anonymous visitors and closed to real users.** Anyone can
   read or upload any file, while signed-in clients and staff cannot.
3. **Records can be forged.** A client can write "filing verified" into their own case
   history, or post a message that appears to come from the firm.
4. **Sign-in can be attacked.** Guess limits reset each time a new code is requested;
   one email can become both a staff and a client login; in some configurations the
   code can be shown on screen for any address.
5. **Some screens state things that are not true:** "Filed", "Complete", "Paid", "Saved",
   "private tenant".
6. **The tests do not prove much.** There are 9 engine checks, some using invalid
   fixtures, and no database, route or end-to-end tests.

## What should be built next to create measurable customer value?

In this order, each step a separate pull request awaiting your approval:

1. **Merge the migration repair (PR #6)**, then the security fixes. About 1–2 weeks.
2. **Let a registered taxpayer actually sign in**, and let the firm open a case.
3. **The payment-discrepancy journey on synthetic data**:
   - record the debit and the evidence;
   - track the escalation;
   - show one clear next step;
   - never call the tax "paid" without a reviewer and evidence.

   That is your first milestone.
4. **Test it with 5–10 IGS taxpayers.** The measure is zero false "paid" conclusions and
   whether participants can say what is still unresolved.

TaxDome-style extras (automation, e-signature, invoicing, multi-firm) come after,
when a paying firm needs them.

## Decisions needed from you

1. **Approve P0 in this order:**
   - merge PR #6 (or only its migration fix);
   - storage and record-forgery fixes;
   - sign-in fixes, with the sign-in function redeploy approved separately;
   - status wording.
2. **Should a client be able to report a fee payment from the portal?** If not, the button goes.
3. **Confirm the incident data contract** (`security-and-integrity-review.md` §3, and the
   strategy folder's `backlog.md`) once Agent B's plan is in.

## The other documents in this folder

| File | Purpose |
|---|---|
| `security-and-integrity-review.md` | The 27 Oct findings reassessed, new findings, fixes, tests |
| `implementation-readiness.md` | Every module, classified with evidence |
| `user-journey-gaps.md` | Journeys A–D: the exact step where each stops |
| `taxdome-feature-parity.md` | TaxDome capability vs KIMA, with TaxDome sources |
| `product-alignment.md` | Positioning and principles checked against the code |
| `prioritized-roadmap.md` | Phases, dependencies, effort, risks |
