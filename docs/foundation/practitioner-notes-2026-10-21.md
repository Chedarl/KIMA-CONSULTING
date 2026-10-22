# Practitioner notes — Irina, 21 October 2026

Second practitioner session, recorded while she worked through the prototype. The
blueprint's evidence rule applies: this is **one practitioner's observation**, not
market data, and each claim below carries a status.

Status vocabulary, per blueprint §4 and CLAUDE.md:

| Status | Meaning |
|---|---|
| `OBSERVED` | She reported it about her own practice. True of her, not yet general. |
| `CORROBORATED` | Independent research agrees. See `cameroon-rule-corpus-research.md`. |
| `OFFICIAL` | Traced to a DGI or legislative source. |
| `NEEDS LEGAL VALIDATION` | Plausible, consequential, not yet traced to a text. |
| `CORRECTED` | Substantially right, but mislabels the governing variable. |

---

## 1. The claim that reframes document handling

> "There are a number of things that we look out for in order to approve an accounting
> document. A document might not be good for accounting but be recorded for taxation."

Status: `OBSERVED`, and it is the most important sentence in the session.

Every document system we researched — including the Big Four portals in
`portal-patterns-research.md` — treats an incoming document as having **one**
state: received, accepted, rejected. Irina is describing something else. In her
practice a document carries **independent verdicts that can disagree**. A
handwritten receipt with no NIU may be unusable for a VAT claim, still deductible
as a charge, and still recorded because the expenditure genuinely happened.

A single accept/reject control cannot express that. It forces the practitioner to
pick one answer and lose the other two — which is precisely the information the
client later asks about ("why was my receipt refused?" — it wasn't; its VAT was).

**Consequence.** Document review is modelled as three verdicts, each independently
reasoned and independently cited:

1. **Accounting** — can this be booked under the applicable OHADA framework?
2. **Charge deductibility** — is the expense deductible against taxable profit?
3. **VAT recovery** — is the input VAT recoverable?

Implemented in `lib/document-review.ts`. Rejection is never a single verdict, and a
failed accounting verdict does not discard the document — it records it with a
stated defect, which is her "not good for accounting but recorded for taxation".

---

## 2. Her invoice checklist

> company name, address, and contact details of both the supplier and the customer ·
> NIU of both the supplier and the client · clear description and itemization of the
> goods sold or services delivered · total amount exclusive of tax (HT), applicable
> VAT rate (19.25%) · method of payment — for amounts less than 100000 acceptable if
> paid by cash, and for 100000+ acceptable if paid by bank, cheque etc.

| Item | Status | Note |
|---|---|---|
| Both parties' name, address, contact | `CORROBORATED` | Standard mandatory mention. Exact list set by the CGI; article not yet read directly. |
| NIU of supplier **and** client | `CORROBORATED` | Client NIU is specifically a B2B requirement. |
| Itemised description | `CORROBORATED` | |
| Total HT and VAT rate 19.25% | `OFFICIAL` | 19.25% = 17.5% principal + 10% centimes additionnels communaux. |
| Cash threshold at 100,000 | `OFFICIAL` | Her "100000k" is a typo for 100,000 FCFA. The DGI's own VAT fact sheet states the rule and is **stricter** than she put it — see below. |

**Where the official text is stronger than her summary.** She frames the threshold
as a *payment-method preference*. The DGI's VAT fact sheet frames it as a
*condition of the right to deduct*: for operations of at least 100,000 FCFA the
right to deduct is allowed only on condition that the operation was not paid in
cash, and no VAT credit refund is admitted on the basis of cash-paid invoices.

That is a harder rule than "acceptable / not acceptable", and it belongs on
verdict 3, not on intake.

**The rule she did not mention, which matters more than any on her list.**
Input VAT is deductible only where the invoice comes from a supplier who is
registered **and taxed under the régime du réel**, bearing that supplier's NIU.
Since IGS now covers every business under 50M turnover (§4), a large share of a
small client's purchase invoices come from suppliers who are not under the réel and
are not VAT collectors. Those invoices carry **no recoverable VAT whatsoever**,
however perfectly they are drawn up.

Status: `CORROBORATED`; `NEEDS LEGAL VALIDATION` as to its exact article.

This is the single highest-value check in the engine. It is invisible on a paper
checklist — nothing on the face of an invoice says "my supplier is under IGS" — and
it is the kind of finding that costs a client a reassessment. Kima can raise it,
explain it, and cite it.

---

## 3. Deadlines

> Deadline for declarations and payments of monthly tax is 15th of the next month.

Status: `CORROBORATED`. Monthly VAT, the 2.2% monthly IS instalment and employee
IRPP all fall on the 15th of the following month. Monthly VAT is due **even where
there was no activity**, which is a trap worth surfacing to clients.

> The DSF deadline you put for march 15th was changed. Now DSF have different
> deadline depending on the regime. DGE (large taxpayer) 15 march · CIME (medium
> sized enterprise) 15 April · IGS (small) 15 may

Status: `CORRECTED`.

She is right that a single 15 March date is wrong, and right about all three dates.
But the governing variable is **not the regime** — it is the **tax centre of
attachment**: DGE 15 March, CIME 15 April, **CDI** 15 May. She wrote "IGS" in the
third row because IGS taxpayers are in practice attached to a CDI, so the two
correlate strongly. They are not the same variable.

Keeping them distinct is not pedantry. A taxpayer can be under the réel and still
attached to a CDI; the regime drives *which* obligations exist, the centre drives
*when* the DSF is due. Collapsing them produces a wrong date for exactly the mixed
cases a firm already gets wrong by hand.

`lib/diagnostics.ts` already keyed the deadline off `tax_centre`, which was correct.
What is added is a reconciliation finding that fires when the recorded regime and
centre form an unusual pair, so the practitioner is asked rather than silently
trusted.

> AB's also we have some taxpayers under IGS, whose apart from monthly declarations,
> we have quarterly declarations.

Status: `CORROBORATED`. IGS is paid quarterly, within fifteen days of each quarter
end — 15 April, 15 July, 15 October, 15 January — or in a single annual payment by
15 April.

> To add, we have "renouvellement" which is done every year before the 28th of February.

Status: `CORRECTED`. This is the annual **patente** renewal for existing taxpayers,
due the last day of February (CGI art. C23). It is not universal: payment of IGS is
reported to be libératoire of the patente, so IGS taxpayers generally do not owe
this renewal. Modelled as an obligation **conditional on regime**, flagged for
validation rather than applied to everyone.

> Declarations (can be gotten online) · Previous DSF (can be gotten online)

Status: `OBSERVED`, and strategically the most useful aside in the session. See
`harmony2-dgi-platform-research.md`. These two items are retrievable by the firm
from the DGI's Harmony 2 portals. They sit on her list of things she *asks the
client for*; they should not. Two of her six document asks can leave the client
checklist entirely.

---

## 4. Regimes

> Réel: it englobes all medium size enterprises (yearly turnover over of 50 million).
> IGS: englobes small enterprises (yearly turnover from less than 50 million)
> classified from class 1-10.

Status: `CORROBORATED`.

IGS — **Impôt Général Synthétique** — was created by the 2025 Finance Law and
**replaced both the impôt libératoire and the régime simplifié**. It applies to
commercial, industrial, artisanal and agropastoral activity with turnover at or
below 50M FCFA; the ceiling for the liberal professions and non-commercial activity
is 30M. It is a flat amount by turnover band, not a tax on profit. Sources disagree
on the number of bands (7, 10 and 12 all appear); the official schedule must be read
before any band is quoted to a client.

**This obsoletes part of our own product.** `lib/organizer.ts` offered "Impôt
libératoire" and "Régime simplifié" as current choices. Both were abolished. A
client picking them today would be classified under a regime that no longer exists.

They are not deleted — the blueprint requires historical periods to keep the rules
that applied to them. They become legacy values with an `effective_to` date, usable
for a 2024 period and unavailable for a current one.

Two further consequences worth holding on to:

- IGS businesses at or above 10M turnover must keep accounts on the OHADA
  **minimal cash-basis system (SMT)**. This is a turnover-driven *accounting* rule,
  and the blueprint forbids inferring an obligation from turnover alone — so it is
  raised as a question for the reviewer, never applied automatically.
- IGS is reported to be libératoire of patente, VAT and income tax. If that holds,
  an IGS client is **not a VAT collector**: their sales invoices carry no VAT, and
  the VAT verdict on their purchases is moot. Which demolishes the comfortable
  assumption in §5.

---

## 5. "Both regimes require the same documents"

> Both regime requires the same which are: Purchase invoices · Sales invoices ·
> Expenditure · Declarations (can be gotten online) · Bank statements · Previous DSF
> (can be gotten online)

Status: `OBSERVED`, and true only of the *list*.

The documents requested are indeed broadly the same. The **checks applied to them
are not**, and this is where a shared checklist quietly produces wrong work:

| | Réel client | IGS client |
|---|---|---|
| Sales invoices | Must carry VAT at 19.25% | Carry **no** VAT; VAT on a sales invoice is a defect |
| Purchase VAT | Recoverable, subject to three conditions | **Not recoverable at all** |
| Accounting framework | Système normal (SYSCOHADA révisé) | SMT at and above 10M |
| Cadence | Monthly, 15th | Quarterly, plus annual |
| DSF | Full presentation | Applicable simplified presentation |

So: one checklist, regime-aware verdicts. The checklist is the cheap part. The
verdict rules are the product.

---

## 6. Her proposed client-portal structure

> The clientele portale should be divided under Regime: REEL / IMPOTS GENERAL
> SYNTHETIQUE. Under REEL we have the Moral person and physical person. Under IGS we
> have moral person; physical person: this is where even individuals fall (salary
> earners, students, and people wishing to declare their PIT).

Status: `CORRECTED` — and the correction improves her design rather than discarding it.

Her instinct is right that the portal needs segmentation, and that the segments
drive different document sets and different language. Two problems with regime as
the top-level axis:

**A salary earner is not an IGS taxpayer.** IGS taxes business activity. An employee
on payroll, or a student, carries no IGS liability at all; their income tax is IRPP,
withheld at source for salary. Filing them under "IGS → physical person" classifies
them under a business regime they do not belong to — and that classification is
exactly what the diagnostics exist to refuse to guess.

**Regime is unknown at the moment of sign-up.** It is the thing a reviewer verifies
*after* onboarding, against the taxpayer's official profile. An information
architecture whose front door demands it asks the visitor the one question they
cannot reliably answer, and whose wrong answer poisons everything downstream.

**What her structure becomes.** The top-level axis is **who the taxpayer is** —
which the visitor always knows — and regime becomes a verified attribute of business
taxpayers only:

```
Client portal
├── Business (entreprise)
│   ├── Moral person    — SARL, SA, …
│   ├── Physical person — sole trader, liberal profession
│   └── Regime: réel | IGS       ← reported at intake, reviewer-verified;
│                                  drives obligations, cadence and verdicts
└── Individual (particulier)
    ├── Salary earner       — IRPP on salary, withheld at source
    ├── Student / no income — typically nothing owed; say so plainly
    └── Voluntary PIT filer — annual income declaration
```

Everything she grouped is preserved. Nothing is classified by a field the user
cannot answer. The regime distinction lands where it governs — on business
taxpayers — and reaches the client only as verified fact.

**The individual track is new product scope.** `lib/organizer.ts` required a
registered business name; an individual has none. This is a real segment, it is the
largest one by headcount, and the DGI already runs a pre-filled annual income
declaration for exactly these people (`dpr.harmony2.cm`). Her aside opened a segment
we had not modelled.

---

## 7. What this session changed

| Change | Where |
|---|---|
| Document review becomes three independent verdicts | `lib/document-review.ts` (new) |
| Invoice mention checks, cash threshold, supplier-regime VAT rule | `lib/document-review.ts` |
| Versioned rule registry with sources, effective dates, prorogations | `lib/rules.ts` (new) |
| DSF deadline keyed to centre; regime/centre mismatch detected | `lib/rules.ts`, `lib/diagnostics.ts` |
| IGS replaces libératoire and simplifié; both kept as legacy | `lib/rules.ts`, `lib/organizer.ts` |
| IGS quarterly cadence; conditional February patente renewal | `lib/rules.ts` |
| Portal segmented by taxpayer type, not regime | `lib/organizer.ts` |
| Individual (particulier) track | `lib/organizer.ts` |
| Harmony 2 documents retrieved by the firm, not asked of the client | `lib/organizer.ts`, research doc |

## 8. Still to put to her

1. The band schedule actually applied to IGS clients — 7, 10 or 12 bands, and the amounts.
2. Whether her IGS clients are billed the patente, which would contradict the libératoire reading.
3. Whether she has seen a reassessment turn on a supplier's regime, and how she checks it today.
4. Which Harmony 2 portals she personally uses, and what she still cannot get online.
5. Whether she has ever served an individual filer, and what they asked for.
