# E — Security, legal and source-verification plan

## 1. Threat model for incident evidence

Incident records hold the most sensitive things a taxpayer will hand us: payment
references, wallet screenshots, NIU, phone numbers, sometimes a DGI login screen.

| Threat | Control (proposed) |
|---|---|
| Taxpayer uploads a screenshot containing their DGI password or an OTP | Upload screen warns before capture; free-text fields reject 6–8 digit strings labelled as codes; **KIMA never asks for DGI credentials** (`harmony2-dgi-platform-research.md` §5) |
| Full transaction reference leaks | Stored masked (last 4) plus sha256 of the full value; full value only inside the uploaded evidence file |
| Another taxpayer reads the case file | Tables under `can_see_taxpayer()`; storage scoped by path (P0-1); export generated server-side for the caller only |
| Client forges a "verified" payment or certificate | No client capability to verify; DB CHECK requires reviewer + evidence; client event kinds restricted (P0-2) |
| History rewritten after a dispute | `case_events` append-only (existing); incident contacts append-only |
| Case file mistaken for an ACF | No seal, no QR, no "conforme"; fixed "not an ACF" line; link to the DGI service |
| Real data before the gates | R-32 synthetic-only and R-36 stay in force; the slice runs on synthetic fixtures only |
| Service key exposure in the Edge Function path | Key never in Vercel or the repo; function uses the platform-injected key; routes keep identical request/response shapes |

Legal: R-05 (authorisation to represent taxpayers) and R-06 (Law 2024/017) remain
**blocking** for any real taxpayer. Nothing in this plan clears them.

## 2. Sources to verify before any guidance ships

Status scale from `cameroon-rule-corpus-research.md`. Findings of 27 Oct 2026 — research
notes, **not** loaded into `lib/rules.ts`.

| ID | Question | What was found | Status now | Needed to verify |
|---|---|---|---|---|
| S-1 | IGS declaration and payment schedule | CGI art. C41 reportedly allows annual (by 15 April) or quarterly payment within 15 days of quarter end; sites disagree on the quarterly dates. The LF 2026 *exposé des motifs* (dgb.cm, Nov 2025) proposes to rework arts. C38–C46 | `inferred` (unchanged) | The published CGI 2026 text or the DGI fiscal calendar on impots.cm |
| S-2 | 2026 IGS prorogation | Press: 15 April → 30 April 2026 under art. 16 LF 2025; 8 May for CFLP taxpayers; hotline 8200 | `inferred` | The MINFI communiqué (reference number) |
| S-3 | IGS payment route and failure handling | Trésor Pay was mandated for **non-tax** revenue (arrêté of 28 May 2025); separately, a 13 May 2026 report says the DGI uses Trésor Pay (`dgi.tresorpublic.cm`) for **avis d'imposition** at the Yaoundé CFLP, with MoMo/Orange USSD codes and a printable quittance retrievable by assessment number. MINFI circulars of 30 Dec 2020 (electronic quittance) and 21 Jul 2021 (payment reconciliation) are cited by secondary analysis. No documented procedure for "debited but not recognised" was found | `inferred` (route); `unknown` (dispute procedure and waiting period) | The 2021 circular text; DGI/Trésor guidance on reconciliation; operator dispute process |
| S-4 | ACF issuance | MINFI leaflet (primary) exists; secondary sources: online issuance, ~3-month validity, QR authentication, blocked by arrears, moratorium/sursis route. Previously recorded on `fanr.harmony2.cm` (`inferred`) | `inferred` | Read the MINFI leaflet in full; DGI ACF page |
| S-5 | Support channels | Hotline 8200 and impots.cm online assistance (press, Apr 2026); `support.harmony2.cm` (`verified` in the Harmony research) | mixed | DGI page listing support channels |

**Rule:** P1-7 guidance strings may cite only `verified` sources. Where a source is not
verified, the screen says "not yet confirmed — ask your tax centre or call 8200" (once S-5
is verified) rather than paraphrasing commentary.

Sources consulted on 27 Oct 2026 (secondary unless marked):
- impots.cm — arrêté RTS 2026 (primary): https://www.impots.cm/sites/default/files/documents/arr%C3%AAt%C3%A9%20RTS%202026%20VF.pdf
- MINFI ACF leaflet (primary): https://minfi.gov.cm/wp-content/uploads/2024/01/DEPLIANT_ATTESTATION_DE_CONFORMITE_FISCALE.pdf
- DGB, exposé des motifs LF 2026 (primary, proposal stage): https://www.dgb.cm/wp-content/uploads/2025/12/Expose-des-Motifs_LF-2026_fr.pdf
- Digital Business Africa, 13 May 2026: https://www.digitalbusiness.africa/cameroun-la-dgi-simplifie-le-paiement-des-avis-dimposition-via-mtn-momo-orange-money-otp-et-tresor-pay/
- EcoMatin, Trésor Pay for non-tax revenue: https://ecomatin.net/cameroun-le-premier-ministre-impose-tresor-pay-comme-unique-plateforme-de-collecte-des-recettes-non-fiscales
- Cameroun24, prorogation to 30 April 2026: https://cameroun24.net/article/73602-impots-au-cameroun-le-minfi-reporte-lecheance-du-15-avril-au-30-avril-2026-ce-que-les-contribuables-doivent-savoir.html
- Cameroun24, 8 May for CFLP: https://cameroun24.net/article/73812-impots-2026-delai-exceptionnel-accorde-aux-contribuables-le-gouvernement-repousse-lecheance-au-8-mai.html
- Nkafu Policy Institute, payment reform (cites the 2020/2021 circulars): https://nkafu.org/wp-content/uploads/2022/01/La-Reforme-des-Procedures-de-Declaration-des-Revenus-et-de-Paiement-Des-Impots-au-Cameroun.pdf
- LeFisk, IGS: https://lefisk.cm/blog/impot-general-synthetique-cameroun

The brief's own source register (survey coverage, ACDC, LinkedIn posts, MobileMoney news)
establishes **reported pain only**; it is cited in `thesis.md` with that label.

## 3. Proposed risk-register entries

Added to `docs/foundation/risk-register.md` in this PR as **Open**:

| ID | Risk | L | I |
|---|---|---|---|
| R-40 | A tax payment is shown as paid on the strength of a debit, not an official receipt | M | **H** |
| R-41 | A DGI/Trésor outage or reconciliation failure is presented to the taxpayer as their own error — or as resolved | M | **H** |
| R-42 | A KIMA export is presented by a taxpayer as if it were an ACF | M | **H** |
| R-43 | Escalation guidance paraphrases unverified commentary and is wrong | M | **H** |
| R-44 | Incident evidence captures DGI credentials or one-time codes | M | **H** |

## 4. Open questions for the owner

1. **Who is the reviewer for a taxpayer with no firm?** The blueprint requires one. Is it
   a Kima-employed reviewer (`kima_admin` today has *no* professional authority — by
   design), a partner firm, or does the taxpayer stay in "declared only" until they
   engage one?
2. **Price.** Is incident recovery part of a paid engagement, a free entry point, or a
   separate service? The 22 Oct plan limited assisted intake to annual DSF and advisory
   engagements.
3. **Primary sources.** Can someone obtain the MINFI 2026 IGS communiqué, the 2021
   payment-reconciliation circular and the current CGI art. C41 text? Without them P1-7
   ships as "not yet confirmed" everywhere.
4. **Real-user validation.** Is there access to 5–10 IGS taxpayers (ACDC, a CGA, Irina's
   clients) for the comprehension test in `test-protocol.md` §4?
5. **Second firm.** Public onboarding already offers an accounting-firm workspace; P2-5
   (organisation scoping) must land before anyone uses it. Hide that option until then?
