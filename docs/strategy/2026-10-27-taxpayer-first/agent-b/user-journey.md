# User journey — "debited, payment not recognised" (Agent B)

*Agent B, 27 Oct 2026. Planning deliverable for backlog P1-1…P1-6 (Variant 2 in
`../journeys.md` §4). Built against `main` @ `d6f9cca`. Synthetic data only. Every
statement about DGI practice carries its status; where nothing is verified, the screen
says "not yet confirmed — ask your tax centre".*

## 1. The person

**Boutique Ndolo (synthetic)** — a small shop in Douala, declared under the IGS, tax
centre declared as "CDI Douala". The owner pays from a mobile-money wallet on a phone,
often on a slow connection. Every profile fact is the owner's declaration, not verified.
No IGS obligation is active in KIMA (`IGS_QUARTERLY` is `inferred`, `lib/rules.ts`), so
KIMA shows **no due date and no amount** for this taxpayer.

## 2. The problem in one sentence

The wallet was debited, the DGI portal still says "unpaid", and the owner does not know
whether they are compliant, whether to pay again, or what to keep.

## 3. What KIMA controls and what it does not

| Step | Who controls it | KIMA's part |
|---|---|---|
| Whether the payment reached the Trésor / DGI | DGI, Trésor, operator | None |
| How to ask for a receipt or reconciliation | DGI (procedure `unknown`, S-3) | Says "not yet confirmed — ask your tax centre" |
| The dated record of what happened | **KIMA** | Full: declared entries, masked reference, evidence, contact log |
| The single next step | **KIMA** | One action, sourced or marked unconfirmed |
| Saying the tax is **paid** | **A credentialed reviewer** with an official document | Only a reviewer act produces `verified` |

## 4. Journey, step by step

| # | The taxpayer… | Sees on screen | State after | Basis |
|---|---|---|---|---|
| 1 | Opens the case (F-1: no incident) | Five statuses; next action "If a step failed, record what happened" (source: KIMA rule) | payment `unknown` | — |
| 2 | Tries to pay; the portal errors (F-2) | Records "error at payment step" + portal screenshot | incident `open`, payment `attempted` | declared |
| 3 | Gets the next action | "Check your statement or SMS: were you debited?" — **no retry advice** | — | KIMA rule |
| 4 | Sees a debit SMS; records "I was debited" | Payment shows **"Debit seen — not paid"** in amber, "You reported"; banner "Do not pay a second time…" | payment `debit_observed` | declared |
| 5 | Types the transaction reference | Shown as `•••• 0000`; the full value is dropped at once | payment `reference_recorded` | declared |
| 6 | Attaches the SMS screenshot | Evidence list: "Debit SMS — your own record" | — | declared |
| 7 | Next action "Ask your tax centre for the receipt for this payment" | Source line: **"Not yet confirmed — ask your tax centre"** | — | fallback |
| 8 | Goes to the counter; logs the contact (channel, who, file no. masked, answer, what is still open) | Escalation log row; incident moves to "Waiting for the administration" | incident `awaiting_administration` | declared |
| 9 | No answer; "follow up" | Incident "Followed up" | incident `escalated` | declared |
| 10 | Receives a quittance; attaches it as "Official receipt" | Evidence row "Official document"; payment **still not verified** | — | declared |
| 11 | *Reviewer* checks the receipt against the reference and verifies | Payment "Payment verified", "Verified by a reviewer", reviewer named | payment `verified` | verified |
| 12 | *Reviewer* resolves the incident, citing the receipt and a reason | "What is still unresolved: nothing" | incident `resolved` | verified |

F-3 (`test-protocol.md` §1) is the journey stopped at step 8 with two contacts logged.

## 5. The reviewer's side

The reviewer sees the same five statuses, the evidence list split into "official" and
"the taxpayer's own record", and only the controls the engine offers in that state:
**Verify payment**, **Mark disputed**, **Close incident (resolved)**, **Close unresolved**.
Each is refused, with the reason shown, when a credential, an official document or a
reason is missing. A debit SMS never satisfies "official".

## 6. What the taxpayer can answer at every step

The comprehension metrics (`test-protocol.md` §4) are designed in:

- *Correct next action* — one action, always sourced or marked unconfirmed.
- *Evidence completeness* — every entry is timestamped (Africa/Douala) and attributed.
- *False completion* — "paid" appears only after step 11; a debit is labelled "not paid".
- *What is still unresolved?* — a dedicated panel lists the open payment and incident.

## 7. Failure and edge cases

| Case | Behaviour |
|---|---|
| Taxpayer attaches a receipt and tries to call it verified | No control exists in the taxpayer view; the engine also refuses (`reviewer_required`) |
| Reviewer without a recorded credential | Refused, `reviewer_not_credentialed` (owner answer 1, P1-8) |
| Reviewer cites only the debit SMS | Refused, `official_evidence_required` |
| Reviewer resolves before verifying the payment | Refused, `payment_not_verified` |
| A reference shorter than 4 characters | Refused; nothing stored |
| A typed code or password in a field | Warning on the form (R-44); detection of 6–8 digit codes is planned, not built |
| The administration never answers | Reviewer may "close unresolved" with a reason; the taxpayer may reopen |
| Slow connection | The page is one route, 10.1 kB page JS, no network calls after load |

## 8. Out of scope here

Variant 1 as its own incident type with a deadline warning (needs a verified IGS
deadline), Variant 3 (ACF) beyond showing the status and a fallback action, case-file
export (P1-5), real uploads, real persistence, notifications.
