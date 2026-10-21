# Harmony 2 — the DGI's platform, and what Kima may and may not do with it

Researched 21 October 2026. Companion to `practitioner-notes-2026-10-21.md` and
`cameroon-rule-corpus-research.md`.

Irina twice said a document "can be gotten online" — the declarations and the
previous DSF. That aside is the subject of this document, because the place they
are gotten from is **Harmony 2**, the Directorate General of Taxation's platform,
and it changes where two of her six document requests should be addressed.

## 1. What Harmony 2 is

Harmony 2 is the DGI's online tax platform. It has been **progressively replacing
Fiscalis since 1 May 2025**, starting with ACF certificates, NIU registration,
deferral and moratorium requests, and OTP payments.

It is not one site. It is a set of subdomains behind a single sign-on, and the
practical consequence for a firm is that a practitioner's day involves moving
between them by hand.

| Portal | Purpose | Status |
|---|---|---|
| `sso.harmony2.cm` | Single sign-on. Login is **NIU plus password**. | `verified` — the DGI's own support FAQ describes logging in on the SSO page with NIU and password |
| `dpr.harmony2.cm` | *Déclaration pré-remplie* — the annual IRPP return, pre-filled from data the DGI already holds | `verified` — fetched directly; page title is "DGI - Déclaration de l'IRPP" |
| `bef.harmony2.cm` | Beneficial owner declaration, feeding the central register (RCBE) | `verified` — DGI support FAQ |
| `sdc.harmony2.cm` | Account synchronisation and password reset | `inferred` — secondary sources only |
| `fanr.harmony2.cm` | Assessment notices (*avis d'imposition*) | `inferred` |
| `otp.dgi.cm` | Payment | `inferred` |
| `support.harmony2.cm` | Knowledge base | `verified` — fetched directly |
| `fiscalis.cm` | Legacy platform, being retired | `inferred` |

The portal map in circulation disagrees with itself — one guide lists around seven
portals including `teledeclaration-dgi.cm`, another routes notices through
`fiscalis.cm`. Treat the `inferred` rows as a working map to confirm with Irina and
against impots.cm, never as configuration.

Two further points, both `inferred` but load-bearing:

- **DSF for the specialised units (DGE, CIME, CSI) must be filed electronically.**
  Electronic filing for exactly the clients with the earliest deadlines.
- Registration requires a NIU first. The NIU is both the identifier and the
  login — which is why the NIU field in our organizer is not administrative
  trivia. It is the client's key to the government platform.

## 2. Why this matters: the DPR is the individual track, already built by the DGI

`dpr.harmony2.cm` is a **pre-filled** annual income declaration. The taxpayer logs
in and finds data the DGI already holds about them.

Irina, describing who belongs in the client portal, included "salary earners,
students, and people wishing to declare their PIT". We had not modelled individuals
at all — `lib/organizer.ts` required a registered business name. Her aside and the
existence of the DPR point at the same segment from two directions: there is a
population of individual filers, and the DGI has already built them a pre-filled
service.

So the individual track is not speculative scope. Its primary job is narrow and
honest: help a person understand what the DPR is showing them, what to check
before validating, and what to keep. Kima explains and records; the DGI's own
service files.

## 3. Where the firm's time actually goes

Irina's workflow, as recorded in blueprint §3.2, is eight steps. Harmony 2 touches
the ones at each end — retrieving history and prior declarations at the start,
filing and capturing the outcome at the end. The middle (Sage, Excel, DSF
preparation, review) is ours.

The friction worth naming:

1. **She asks clients for documents the state already holds.** Prior declarations
   and prior DSFs are on Harmony 2 under the client's own login. Asking the client
   converts a two-minute retrieval into a multi-day wait, a reminder, and often a
   worse-quality scan than the original.
2. **Credentials are the real bottleneck.** Login is NIU plus password on a single
   SSO. A firm acting for a client either holds those credentials or cannot
   retrieve anything — and that is a governance problem, not a technical one.
3. **Multi-portal navigation is manual.** Declarations, notices, beneficial owner,
   payment and synchronisation are five destinations. Nothing tells a practitioner
   which of them has something new for a given client.
4. **The migration is unfinished.** Fiscalis and Harmony 2 coexist; which service
   lives where moved during 2025 and may move again. Any hard-coded assumption
   about where a thing lives has a short life.

## 4. What Kima may do — and the line it does not cross

The constraint is absolute and comes from CLAUDE.md: **never claim government
integration.** No DGI API access, e-filing capability, authorisation or partnership
may be represented as established without written verification. And: a declaration
is never "filed" because someone clicked a button.

There is no evidence of a public Harmony 2 API. Nothing found suggests third-party
programmatic access exists. So:

**Not permitted.** Scripted login to Harmony 2 on a client's behalf. Storing client
DGI passwords. Screen-scraping. Any UI that implies Kima transmits to the DGI. Any
status reading "filed" that is not backed by an acknowledgment document. Describing
Kima as integrated, connected or interfaced with the DGI.

**Permitted, and sufficient.** Model Harmony 2 as a **retrieval source with human
hands**:

- A document can be marked `firm_retrieved` with `source: harmony2`, naming the
  portal it came from and who fetched it, when.
- Documents known to be retrievable are **removed from the client's request list**
  and placed on the firm's own retrieval checklist. The client is told the firm is
  getting it, not asked for it.
- Credentials are never stored. The retrieval checklist records *that* a
  practitioner fetched an item, not how they authenticated.
- Filing stays manual, and the recorded status still depends on an uploaded
  acknowledgment — the `EVIDENCE_MISSING` diagnostic already enforces this.
- The portal map is configuration carrying a verification status, so a subdomain
  moving is a data change, not a code change.

This is a deliberately modest capability, and it is the whole of what the evidence
supports. The honest version is also the useful one: it removes the client wait
without claiming anything we cannot prove.

## 5. The streamlining, measured against Irina's own list

Her six requested documents, re-routed:

| Document | Today | With Harmony 2 modelled | Effect |
|---|---|---|---|
| Purchase invoices | Asked of client | Asked of client | — |
| Sales invoices | Asked of client | Asked of client | — |
| Expenditure | Asked of client | Asked of client | — |
| Bank statements | Asked of client | Asked of client | Bank, not DGI. Unchanged. |
| Declarations | Asked of client | **Firm retrieves** | Off the client's list |
| Previous DSF | Asked of client | **Firm retrieves** | Off the client's list |

**Two of six items leave the client checklist** — a third of the asks, and
specifically the two most likely to stall, because a client who has mislaid last
year's DSF cannot produce it at any speed while the firm can fetch it in minutes.

The mechanism matters more than the count. Blueprint §3.4 identifies the real cost
as the client not knowing what is outstanding; `DOCS_OUTSTANDING` in
`lib/diagnostics.ts` **blocks approval** while anything is open. Under the old
model, two items the firm could have retrieved itself sat in that blocking count
waiting on the client. Removing them does not merely shorten a list — it removes
two client-dependent items from the gate that holds up approval.

Honest limits on the claim: the firm still needs access, retrieval is still manual,
and nothing here speeds up the middle of the workflow, which is where the week
actually goes. This is a reduction in waiting, not in work.

## 6. What to confirm with Irina

1. Which portals she actually uses, and which still send her to Fiscalis.
2. How she authenticates for a client today — the client's own credentials, a
   mandate, or the client logging in with her present. This decides whether the
   retrieval checklist is even workable.
3. Whether the DSF she downloads is the filed workbook or a summary, since
   `sage-dsf-ingestion-research.md` depends on the file's actual shape.
4. Whether she has used the DPR for an individual, and what it pre-filled.
5. What Harmony 2 still will not give her, which is where our remaining value is.

## Sources

Fetched directly during research:

- [dpr.harmony2.cm](https://dpr.harmony2.cm/en/) — "DGI - Déclaration de l'IRPP"
- [DGI support — déclaration en ligne du bénéficiaire effectif](https://support.harmony2.cm/kb/faq.php?id=29) — confirms `bef.harmony2.cm`, SSO login with NIU and password

Official DGI:

- [DGI — Guide d'utilisateur, déclaration annuelle des particuliers](https://www.impots.cm/sites/default/files/documents/Guide%20d'utilisateur%20de%CC%81claration%20annuelle%20des%20particuliers_082146.pdf)
- [DGI — Déclarations Statistiques et Fiscales](https://www.impots.cm/fr/actualites/declarations-statistiques-et-fiscales)

Secondary — commentary from private practices, not authority, and the source of
every `inferred` row above:

- [LeFisk — Fiscalis / Harmony 2 migration, OTP, NIU, ACF](https://lefisk.cm/blog/fiscalis-harmony2-teledeclaration-dgi-otp-niu-acf-synchronisation)
- [LeFisk — Harmony 2 synchronisation and password reset](https://lefisk.cm/outils/harmony2)
- [LeFisk — avis d'imposition](https://lefisk.cm/outils/avis-imposition)
- [LeFisk — DPR Harmony 2, déclaration pré-remplie](https://lefisk.cm/blog/dpr-harmony2-cameroun-declaration-preremplie-avis-fiscal-authentification-av-gnr)
- [LeFisk — déclarer ses revenus 2026](https://www.lefisk.cm/blog/comment-declarer-revenus-cameroun-fiscalis-harmony-dgi)
- [Omamori — migration Fiscalis vers Harmony 2 pour les PME](https://www.omamori.cm/en_US/blog/migration-fiscalis-harmony2-dgi-cameroun-guide-pme)
