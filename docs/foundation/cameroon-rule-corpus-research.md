# Cameroon rule corpus — research, sources and verification status

Companion to `practitioner-notes-2026-10-21.md`. Researched 21 October 2026.

This document exists because of a hard constraint: **never invent regulatory rules.**
Every rule Kima applies must carry a legal source, jurisdiction, effective date and
verification status, and **unverified rules stay inactive**. This file is the
evidence behind `lib/rules.ts`. If a rule is not here, it may not ship active.

## Verification status — and what each status permits

| Status | Evidence | May the engine act on it? |
|---|---|---|
| `verified` | Traced to an official DGI publication or a legislative text | Yes — active |
| `inferred` | Multiple independent secondary sources agree, no official text read | **No** — carried, displayed as needing validation, inactive |
| `unverified` | Single source, or sources disagree | **No** — recorded only, never surfaced as a rule |

A blunt note on source quality. Cameroon tax information online is dominated by
private practices that sell tax services (lefisk.cm, cga3s.com, fiscafinance.com,
codegeneraldesimpots.com). They are often right and are the only accessible
consolidated commentary, but they are **not authority**, they sometimes contradict
each other, and several are plainly SEO-generated. Only `impots.cm` and the
published finance laws are treated as official here. The result is that most of
this corpus lands at `inferred` and therefore **inactive** — which is the correct
and intended outcome, not a gap to paper over.

---

## 1. VAT rate

| Field | Value |
|---|---|
| Rule | General VAT rate 19.25% — 17.5% principal plus 10% centimes additionnels communaux on the principal |
| Source | DGI, *Fiche TVA* (impots.cm) |
| Status | `verified` |
| Effective | In force at research date |

Worth stating in the UI as the decomposition, not just "19.25%": practitioners
reconcile the 17.5% and the CAC separately, and clients who see 17.5% on one
document and 19.25% on another assume an error.

---

## 2. Right to deduct input VAT

Three conditions, each independently sufficient to deny the deduction.

### 2.1 Cash payment at or above 100,000 FCFA

| Field | Value |
|---|---|
| Rule | For operations of at least 100,000 FCFA the right to deduct is allowed only if the operation was **not** paid in cash. No VAT credit refund is admitted on the basis of cash-paid invoices. |
| Source | DGI, *Fiche TVA* (impots.cm) |
| Status | `verified` |
| Note | Confirms Irina's threshold and direction. The official framing is stricter than hers — it is a condition of deduction, not a documentation preference. |

### 2.2 Supplier registered and under the régime du réel, NIU on the invoice

| Field | Value |
|---|---|
| Rule | VAT is deductible only where it appears on an invoice duly issued by a supplier who is registered and subject to the régime du réel, bearing that supplier's unique taxpayer number (NIU). |
| Source | DGI *Fiche TVA* for the NIU and registration requirement; the "under the réel" qualification appears in the fact sheet's wording and in secondary commentary |
| Status | `inferred` — pending direct reading of the governing CGI article |
| Consequence | An invoice from an IGS supplier yields **no** deductible VAT, however well drawn up. |

This is the highest-value check in the system and the one Irina did not mention.
It is also the one most in need of a lawyer's eye before it is activated, because
acting on it wrongly tells a client to write off VAT they were entitled to.

### 2.3 Necessary to the business

| Field | Value |
|---|---|
| Rule | The expense must be necessary to the operation of the business, and the supplier subject to VAT in Cameroon. |
| Source | DGI *Fiche TVA* |
| Status | `verified` as a principle; its application is a judgement, not a computation |
| Handling | Never decided by the engine. Raised for the practitioner. |

---

## 3. Mandatory invoice mentions

| Field | Value |
|---|---|
| Rule | Supplier NIU, RCCM, registered name, address and contact; client NIU for B2B; continuous invoice numbering; invoice number and date; itemised description of goods or services; total exclusive of tax (HT); VAT rate and VAT amount; total inclusive. |
| Source | Secondary commentary, consistent across sources; the authoritative list is set by the CGI (articles in the region of 163–165, cited but not read directly) |
| Status | `inferred` |
| Retention | Invoices to be retained 10 years (`inferred`) |

The sources do not list identical mentions. `lib/document-review.ts` therefore
separates the mentions that are **independently corroborated by an official rule**
(supplier NIU — required for VAT deduction, §2.2) from those resting only on
commentary, and weights the verdicts accordingly.

---

## 4. Tax regimes

### 4.1 Impôt Général Synthétique (IGS)

| Field | Value |
|---|---|
| Rule | Flat tax by turnover band, replacing the impôt libératoire and the régime simplifié. Applies to commercial, industrial, artisanal and agropastoral activity with annual turnover excluding tax at or below 50M FCFA; 30M for the liberal professions and non-commercial activity. |
| Created by | Finance Law 2025 |
| Effective | From 1 January 2025; thresholds as stated applicable from 1 January 2026 |
| Source | Secondary commentary, broadly consistent; government sensitisation campaign reported in the trade press (Investir au Cameroun) |
| Status | `inferred` on the detail, `verified` that the tax exists and is being collected |

Unresolved, and consequential:

- **Number of bands.** Sources say 7, 10 and 12. Irina says "class 1-10". No band
  amount may be quoted to a client until the official schedule is read.
- **Scope of the libératoire effect.** Commentary says IGS payment is libératoire of
  patente, VAT and income tax; other commentary presents IGS as simply a regime
  distinct from the réel. These are materially different products for the client.
  Carried as `unverified`, and it is question 2 for Irina.
- **Accounting obligation.** IGS businesses at or above 10M turnover reportedly must
  keep accounts on the OHADA minimal cash-basis system (SMT). `inferred`. Even once
  verified it may not be auto-applied: deriving an obligation from turnover alone is
  forbidden by the blueprint.

### 4.2 Régime du réel

| Field | Value |
|---|---|
| Rule | Turnover above 50M FCFA. Monthly obligations; corporate income tax; VAT collector. |
| Status | `inferred` on the threshold, `verified` that the regime exists |

### 4.3 Abolished regimes

| Regime | Status |
|---|---|
| Impôt libératoire | Replaced by IGS. Retained as a legacy value with `effective_to` 2024-12-31. |
| Régime simplifié | Replaced by IGS. Same treatment. |

They remain selectable for historical periods only. Blueprint §3.7 requires previous
rule versions to be preserved for historical periods; deleting them would make a
2024 engagement unreproducible.

---

## 5. Deadlines

### 5.1 Monthly — 15th of the following month

| Field | Value |
|---|---|
| Rule | VAT declaration and payment, monthly corporate income tax instalment (2.2% of monthly turnover excluding tax — 2% plus 10% CAC), employee IRPP: due the 15th of the month following the operations. VAT must be declared even where there was no activity. |
| Source | Secondary commentary citing CGI art. 142 for the VAT obligation |
| Status | `inferred` |
| Corroborates | Irina's monthly deadline statement |

### 5.2 DSF — by tax centre of attachment

| Centre | Date | Status |
|---|---|---|
| DGE — Direction des Grandes Entreprises | 15 March | `inferred` |
| CIME — Centre des Impôts des Moyennes Entreprises | 15 April | `inferred` |
| CDI — Centre Divisionnaire des Impôts | 15 May | `inferred` |

Consistent across secondary sources. **The official position is more complicated:**
impots.cm states the DSF is to be transmitted by 15 March, and a 2019 ministerial
communiqué extended that year's deadline to 30 June. So the three-date split is
well attested in practice but the single official date we can actually cite is
15 March.

This is why all three are `inferred` and why the engine treats a resolved DSF date
as **requiring confirmation against the current year's communiqué** rather than as
settled fact.

Also recorded: DSF for the specialised units (DGE, CIME, CSI) must be filed
electronically. `inferred`. It is the hinge for §6 — electronic filing means
Harmony 2.

### 5.3 IGS — quarterly, or annually

| Field | Value |
|---|---|
| Rule | Paid quarterly within fifteen days of each quarter end — 15 April, 15 July, 15 October, 15 January — or in a single annual payment by 15 April. |
| Source | Secondary commentary (fiscafinance.com and others) |
| Status | `inferred` |
| Corroborates | Irina's "quarterly declarations" for some IGS taxpayers |

One source reports the 2026 IGS deadline moved from 15 April to 30 April. Not
corroborated. It is a live illustration of §5.5.

### 5.4 Patente renewal — last day of February

| Field | Value |
|---|---|
| Rule | Renewal of the patente by existing taxpayers, due the last day of February (28th, or 29th in a leap year). |
| Source | DGI tax calendar, citing CGI art. C23 |
| Status | `verified` as to the date and the obligation |
| Condition | Reportedly not owed by IGS taxpayers, IGS being libératoire of the patente. `unverified`. |
| Corroborates | Irina's "renouvellement before the 28th of February" |

One outlying source gives 31 March. Inconsistent with the DGI calendar; discarded.

### 5.5 Prorogations — a first-class concept, not an exception

Deadline extensions are **routine**, not rare. The Minister of Finance may extend
declaration and payment deadlines under article 16 of the 2025 Finance Law — though
not alter rates or create or abolish taxes. A documented example: 15 March extended
to 27 March in 2023; the 2019 DSF extension to 30 June; the reported 2026 IGS move
to 30 April.

Status: `inferred` as to the specific instances, `verified` as to the practice.

**Design consequence, and it is a real one.** A compliance product that renders a
statutory date as fixed truth will be wrong several times a year, visibly, in the
one place clients are watching. So `lib/rules.ts` models a statutory date and a
`Prorogation` that overrides it for a stated period, carrying its own communiqué
reference, and the resolved date always reports which of the two it came from. A
prorogation with no communiqué reference is not a prorogation.

---

## 6. What goes active, and what does not

Applying the constraint honestly:

| Rule | Active? |
|---|---|
| VAT rate 19.25% and its decomposition | **Active** — `verified` |
| Cash payment at or above 100,000 blocks VAT deduction | **Active** — `verified` |
| Patente renewal date (last day of February) | **Active** — `verified`; its IGS exemption is not |
| Supplier must be under the réel for VAT deduction | Inactive — surfaced as an advisory needing validation |
| Mandatory invoice mentions | Inactive as a rule; used as a completeness prompt |
| DSF dates by centre | Inactive as settled fact — resolved, then flagged for confirmation against the year's communiqué |
| Monthly 15th, IGS quarterly | Inactive — advisory |
| IGS bands and amounts | Not carried at all. No number is known well enough to display. |

Four of the rules Irina gave us are not yet shippable as rules. That is the system
working. An inactive rule that says "a human must confirm this, here is why, here is
what we found" is worth more than an active rule that is wrong — and in this domain
a wrong active rule is how a client gets reassessed.

---

## Sources

Official:

- [DGI — Fiche TVA](https://www.impots.cm/sites/default/files/documents/FICHE%20TVA.pdf)
- [DGI — Déclarations Statistiques et Fiscales](https://www.impots.cm/fr/actualites/declarations-statistiques-et-fiscales)
- [DGI — Calendrier fiscal](https://www.impots.cm/fr/calendrier-fiscal)
- [DGI — Guide d'utilisateur, déclaration annuelle des particuliers](https://www.impots.cm/sites/default/files/documents/Guide%20d'utilisateur%20de%CC%81claration%20annuelle%20des%20particuliers_082146.pdf)
- [Exposé des motifs, Loi de Finances 2026](https://www.dgb.cm/wp-content/uploads/2025/12/Expose-des-Motifs_LF-2026_fr.pdf)

Secondary — commentary, not authority:

- [Deloitte — principales mesures de la loi de finances 2025](https://blog.avocats.deloitte.fr/cameroun-les-principales-mesures-importantes-de-la-loi-de-finances-pour-2025/)
- [Investir au Cameroun — IGS, sensibilisation](https://www.investiraucameroun.com/gestion-publique/2305-22043-impot-general-synthetique-le-gouvernement-intensifie-la-sensibilisation-pour-collecter-50-milliards-de-fcfa)
- [Investir au Cameroun — IGS, reversements aux communes](https://www.investiraucameroun.com/gestion-publique/3108-23721-impot-general-synthetique-15-milliards-fcfa-reverses-aux-communes-les-entreprises-contestent-le-report-des-retenues)
- [3S — guide DSF](https://www.cga3s.com/guide-complet-sur-la-declaration-statistique-et-fiscale-dsf-au-cameroun/)
- [3S — procédure de déclaration IGS](https://www.cga3s.com/procedure-declaration-igs-cameroun-2025/)
- [3S — déclaration et paiement de la patente](https://www.cga3s.com/declaration-paiement-patente-cameroun-2025/)
- [Fiscafinance — l'impôt général synthétique](https://fiscafinance.com/limpot-general-synthetique-igs/)
- [Fiscafinance — la patente](https://fiscafinance.com/tout-savoir-sur-la-patente-au-cameroun/)
- [Yorine — règles de facturation](https://yorine.app/blog/facturation-cameroun/)
- [LeFisk — barème IGS](https://lefisk.cm/blog/impot-general-synthetique-cameroun)
- [LeFisk — prorogations fiscales](https://lefisk.cm/blog/prorogations-fiscales-cameroun-reports-echeances-dsf-igs-irpp)
- [LeFisk — régimes d'imposition](https://lefisk.cm/blog/regimes-imposition-cameroun-guide-fiscal)
- [Échéancier fiscal et social mensuel](https://bibliotheque.pssfp.net/index.php/institutions/institutions-nationales/senat/fiscalite/1529-echeancier-mensuel-des-impots-au-cameroun/file)
