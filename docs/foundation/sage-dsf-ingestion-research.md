# Sage Export Intake and DSF Parsing — Research

Research for the **Kima DSF Bridge** (§7.3) and the document intake that feeds it.
Dated 2026-10-20. Every claim below is labelled **[VERIFIED]**, **[INFERRED]** or
**[UNKNOWN]**. Nothing here may drive code while it is still `[UNKNOWN]`.

Sources are listed at the end. Note that one key source is a **third-party training
provider**, not the DGI — its rules describe an automated community workbook, not the
official filing format. That distinction matters and is carried through this document.

---

## 1. What the DGI actually publishes

**[VERIFIED]** The DGI publishes four DSF workbooks as **Excel** files, plus four
**mandatory PDF annexes**:

| Workbook | Applies to |
|---|---|
| DSF Normal (`DGIFORMAT`) | Système normal SYSCOHADA, common law |
| DSF SMT | Système minimal de trésorerie |
| DSF Banque (`DGIFORMAT`) | Banks |
| DSF Assurance (`DGIFORMAT`) | Insurance companies |

**[VERIFIED]** The filenames carry `VERROUILLEVF` — *verrouillé*, locked. The official
workbooks are **protected spreadsheets**. Kima therefore does not invent a DSF file
format: it **fills the DGI's own locked workbook**, which constrains implementation far
more than the blueprint assumes.

**[VERIFIED]** Annexes are compulsory: *"sous peine de voir le processus de transmission
de leurs DSF interrompu"* — omit them and transmission is interrupted.

**[VERIFIED]** Filing deadlines vary **by tax centre**, which validates `tax_centre` as a
first-class column on `taxpayer_tax_profiles` driving `filing_deadline_rule`:

| Tax centre | Deadline |
|---|---|
| DGE | 15 March |
| CIME, CSI-EPA, CSI-PLI | 15 April |
| CDI | 15 May |

**[VERIFIED]** Taxpayers attached to DGE, CIME, CSI and CDI must transmit
**electronically only**, through the tax administration's own system. There is a
"Télédéclaration DSF" entry point.

**[VERIFIED]** Nothing on the DGI pages describes importing accounting data. There is
**no published DGI import specification** for a trial balance.

**[VERIFIED]** Legal basis: the 2019 finance law and **decree 2019/262 of 28 May 2019**,
amending decree 04/073 of 5 April 2004, brought AUDCIF/SYSCOHADA révisé into force in
Cameroon.

**[VERIFIED]** The revised framework retains the **système normal** and the **système
minimal de trésorerie**; the old *simplified* system is gone. This is direct external
confirmation of the blueprint's warning (§7.3): the accounting framework and the tax
regime are different axes and must stay separate columns.

> **[UNKNOWN] and blocking:** whether the DGI's télédéclaration accepts an uploaded
> completed workbook, requires manual re-entry in a web form, or offers any machine
> interface. Until someone logs in and looks, Kima's export target is "a correctly filled
> copy of the official locked workbook, handed to a human" — and **no integration may be
> claimed** (§14).

## 2. The single most important parsing rule

**[VERIFIED]** from the OHADA-hosted practical guide, which states two requirements for
producing a système normal DSF from a trial balance:

1. A **balance N and a balance N-1, each in six columns**.
2. The company chart of accounts (*plan de comptes d'entreprise*, PCE) must faithfully
   reproduce OHADA's decimal codification for the accounts it uses.

And the rule that follows from it:

> **[VERIFIED]** OHADA's codification stops at **four digits**. A company is free to go
> deeper, and automation still works, **provided the OHADA decimal root is never altered**.
> The guide's example: OHADA `7011` *vente dans la région*, company account `7011781`
> *vente dans la région MOMO*.

**This dictates the mapping algorithm.** Kima must map on the **decimal root**, not on the
full account code:

- Normalise the account code to a digit string.
- Match on the **longest matching OHADA root**, from 4 digits down to 1 (class level).
- `7011781` → root `7011` → the DSF line that `7011` feeds.
- Never require an exact full-code match; never truncate blindly to a fixed width.
- Flag any account whose root resolves to nothing as **unmapped, for human resolution** —
  never default it, never guess (Scenario D).

**[VERIFIED]** The chart has **nine classes**, decimal-coded 1–9: classes 1–8 for general
accounting, class 9 for off-balance-sheet commitments and management analytical
accounting. Confidence is medium — the sources are secondary (a student thesis and an
OHADA training programme), so verify against the official AUDCIF chart before coding the
class table.

**[INFERRED]** Because a PCE may legitimately extend beyond four digits, two different
client charts can both be valid and still differ. Mapping profiles must therefore be
**per-firm or per-client, versioned, and reviewed** — exactly what `accounting_mappings`
is for. A single global mapping table will not survive contact with real clients.

## 3. What the six columns are

**[UNKNOWN].** The guide instructs the user to export "in six columns", select all six,
and paste into the sheet **`Balance N`** at **cell A2** — but it **never names them**. It
assumes the practitioner knows.

**[INFERRED]** A conventional francophone *balance générale à six colonnes* is:

| # | Column | Likely content |
|---|---|---|
| 1 | `N° de compte` | Account code, text, may exceed 4 digits |
| 2 | `Intitulé` | Account label |
| 3 | `Mouvement débit` | Period debit movements |
| 4 | `Mouvement crédit` | Period credit movements |
| 5 | `Solde débiteur` | Closing debit balance |
| 6 | `Solde créditeur` | Closing credit balance |

**Do not build against this table.** A six-column balance could equally be opening /
movement / closing debit-credit pairs. The difference changes every computed DSF value.
**This is resolved by looking at Irina's real exports, not by more searching** — which is
the whole reason those files are the gating input to Phase 6.

**[VERIFIED]** The workbook's other sheets are largely automatic once the balances are
pasted: `ENTITE`, `Page de garde`, `FICHE R1`–`R4`, `modèle 1 du bilan`, `bilan actif`,
`bilan passifs`, `compte de résultat`, `TFT`, `TBFT`, and `NOTE 1` onward. Several notes
need manual entry of maturity splits — for example NOTE 4 and NOTE 7 require *"créances à
un an au plus"* and *"créances à plus de deux ans"* to be typed in, because a trial balance
cannot express them. **Ageing is not derivable from a balance.** Kima must collect it as
structured input, not compute it.

**[VERIFIED]** The guide also requires certain **sub-accounts to be opened** in the PCE so
the notes can resolve — for example splitting `412 clients, effets à recevoir en
portefeuille`. A client whose PCE lacks those sub-accounts cannot produce a complete DSF
without restructuring their chart. That is a **client-onboarding finding, not a software
bug**, and the product should detect and report it.

## 4. How Sage actually exports

**[VERIFIED]** Sage 100 Comptabilité: `Fichier` → `Exporter` → `Balance`, format
**"Sage États financiers"**, conversion currency *Aucune*, choose the date range, save as a
text file such as `balance.txt`. Sage's own knowledge base notes this balance doubles as
the chart of accounts.

**[VERIFIED]** Alternative route: `États` → `Balance des comptes` → `Imprimer dans un
fichier`, with output as **text, Excel or Sylk**. Sylk (`.slk`) is a 1980s Microsoft
format — if a client sends one it must be handled explicitly, and Excel will often
mis-open it.

**[VERIFIED]** Custom column orders in Sage 100 come from a **parameterised export
template** with an `.ema` extension. Two firms can therefore produce different column
orders from the same Sage version, deliberately.

**[VERIFIED]** Sage Saari training material contains a chapter *"Exportation de la balance
vers Excel"*, and the common practice is export to `.txt` then convert to `.xls`.
**[UNKNOWN]** the default column order and delimiter for Saari specifically — and Saari is
the product most widespread in francophone Africa, so this is the gap that matters most.

**[VERIFIED]** No published source gives a canonical default column order or separator for
the balance export, in any Sage product. Sage's guidance is version-specific and the
community material is dated.

> **Conclusion.** There is no "Sage format" to code against. There is a **family of
> formats** varying by product, version and per-firm export template. The importer must be
> built as **profile detection plus human confirmation** — which is what the blueprint
> already asks for, now with evidence rather than caution.

## 5. Parsing hazards to design for

Format facts are **[VERIFIED]**; which ones actually appear in Irina's files is
**[INFERRED]** until the fixtures arrive.

| Hazard | Why it breaks parsing | Handling |
|---|---|---|
| **Account codes lose leading zeros** | Excel types `0411` as a number → `411` | Read the column as **text**, never numeric; preserve the original string verbatim |
| **Long codes become scientific notation** | `7011781` can render as `7.01E+06` | Text-typed read; reject a parse whose code column came through numeric |
| **Comma decimal separator** | French locale writes `1 234,56` | Locale-aware numeric parse; never a bare float parse |
| **Space or non-breaking space thousands separator** | `1 234 567` using U+00A0 | Strip whitespace **and** U+00A0 before parsing |
| **Semicolon delimiter** | French Excel CSV uses `;` not `,` | Sniff the delimiter; never assume comma |
| **Windows-1252 / ANSI encoding** | `é`, `à` corrupt when read as UTF-8 | Detect encoding, decode explicitly, never assume UTF-8 |
| **Negatives as `(123)` or `123-`** | Parenthesis and trailing-minus conventions | Normalise both; record which was seen |
| **Totals and subtotal rows** | A `TOTAL` row parsed as an account inflates everything | Detect and exclude — then **use them as a checksum** |
| **Class subtotal rows** | Per-class totals interleaved with accounts | Exclude; verify against the computed sum |
| **Multi-row or merged headers** | Header spans two rows | Locate the header by content, not by row index |
| **`.xls` / `.xlsx` / `.csv` / `.txt` / `.slk`** | Five containers, one logical table | Normalise at the edge; keep the original byte-for-byte |
| **Fixed-width text** | No delimiter at all | Column-position profile, detected before delimiter sniffing |
| **Balance N and N-1 in one workbook or two files** | Pairing ambiguity | Period is an explicit, human-confirmed input |

**Deterministic validation, before any mapping (§7.3):**

1. Σ debit = Σ credit across the balance. If it does not balance, **stop** — nothing
   downstream is meaningful.
2. Parsed account total reconciles with the file's own `TOTAL` row.
3. Every account code resolves to a class 1–9; unknown roots listed as findings.
4. Row count and parsed count agree; skipped rows enumerated, never silently dropped.
5. No duplicate account codes within one balance.
6. N and N-1 are different periods, correctly ordered, same entity.
7. Accounts the notes require but the PCE lacks are reported as a completeness gap.

Every finding lands in `validation_findings`; blocking severities prevent approval.

## 6. Intake: email versus upload link

Your question was whether files arriving **by email or an upload link** can be parsed
reliably. They parse identically once stored — the difference is **context and trust**, and
it is decisive.

### Upload link — recommended primary

A signed, expiring, single-purpose link created **against a specific `document_request`**,
so taxpayer, period and expected document type are known *before* the file exists.

- Binds to `taxpayer_id` + `period_id` + `request_id` at creation — zero disambiguation.
- Enforces file type and size at the edge, rejecting early with a usable message.
- Supports **resumable, queued upload**, which R-30 requires on Cameroonian connections.
- Captures `sha256`, byte size, real content type and uploader identity.
- No mailbox to secure, no spoofing surface.
- Works without a login (magic link) when a client will not create an account — keeping the
  adoption cost near zero while the portal matures.

### Email-in — secondary, and it needs an intake queue

**[INFERRED]**, but on well-established grounds:

- **Identity is unverified.** Anyone can forge a `From`. Mail-sourced files stay untrusted
  until SPF, DKIM and DMARC are checked — and even then the sender is an address, not an
  authenticated user.
- **No binding context.** Mail lands with no `taxpayer_id`, no period, no request. A
  per-taxpayer addressing scheme such as `docs+<token>@…` recovers most of it; a forwarded
  message loses it again.
- **Malware is the normal case, not the edge case.** Macro-bearing spreadsheets, crafted
  OLE2 files. AV scan and real content-type verification before anything is readable (R-12).
- **Silent failure.** Size limits, stripped attachments, nested `.eml`, inline images of
  documents, mail that simply never arrives — all invisible to the sender unless the system
  acknowledges receipt explicitly.
- **It is the habit that already exists.** Refusing email entirely pushes work back into
  channels Kima cannot see.

**Design conclusion:** email-in is worth having, but it **never writes straight into
`documents`**. It writes into an **intake queue** — the `[ADDED]` entity already flagged in
`erd.md` for WhatsApp, which turns out to be needed for email too. A human, or a confident
heuristic plus human confirmation, binds each item to taxpayer, period and request. Only
then does it become a document.

**WhatsApp-in is deferred** per your decision. The intake queue is deliberately
channel-agnostic, so adding WhatsApp later is a new adapter, not a schema change.

## 7. What to ask Irina for

Specific enough to action this week. Anonymised, or with client consent — see R-32.

1. **Five to ten real balance exports**, in whatever format she actually produces, across
   different clients, covering both a monthly and an annual period.
2. **The same balance in every format her Sage offers** — text, Excel, and Sylk if present.
   One balance in three containers is worth more than ten balances in one.
3. **Her exact Sage product and version string** from the About dialog. "Sage" is not
   enough to pin behaviour.
4. **Any `.ema` export template** she or her IT set up, which would explain a non-default
   column order.
5. **A balance N-1 for the same client**, to test pairing.
6. **One completed DSF workbook she has previously filed**, with its annexes — the single
   most valuable artifact here, because it shows the real target rather than the blank form.
7. **A client PCE that needed restructuring** for the notes, if she has one.
8. **One genuinely messy case** — the client whose records she dreads. Designing for the
   clean case is how importers die.

For each file record: source product and version, export menu path, locale and encoding,
and the period. Store them as **anonymised fixtures under version control**, because each
one becomes a regression test for the importer.

## 8. Decisions this research forces

| # | Decision | Rationale |
|---|---|---|
| 1 | Map on the **OHADA decimal root**, longest match 4→1 digits | Verified: a PCE may legitimately extend past four digits |
| 2 | Mapping profiles are **per-firm, versioned, human-reviewed** | Verified: export templates and PCEs legitimately differ |
| 3 | The export target is the **DGI's own locked workbook** | Verified: `VERROUILLEVF` |
| 4 | **Upload links primary, email-in secondary via an intake queue** | Context binding; email identity is unverifiable |
| 5 | Note ageing data is **collected, never computed** | Verified: not derivable from a trial balance |
| 6 | `tax_centre` drives the filing deadline | Verified: three different statutory dates |
| 7 | The balance-balances check is a **hard gate** before mapping | Nothing downstream means anything otherwise |
| 8 | Six-column semantics stay **`[UNKNOWN]`** until real files arrive | The guide never names them |

## Sources

- [DGI — Déclarations Statistiques et Fiscales (DSF)](https://www.impots.cm/fr/declarations-statistiques-et-fiscalesdsf) — official: the four workbooks, locked filenames, mandatory annexes, deadlines by tax centre, electronic-only transmission.
- [DGI — Innovations des nouveaux formats de DSF](https://www.impots.cm/fr/actualites/innovations-des-nouveaux-formats-de-dsf) — official: format changes.
- [DGI — Déclarations Statistiques et Fiscales (actualités)](https://www.impots.cm/fr/actualites/declarations-statistiques-et-fiscales) — official: legal basis, finance law 2019 and decree 2019/262.
- [Guide pratique — production de la DSF OHADA du système normal révisé à partir du fichier Excel automatisé](https://www.ohada.com/uploads/actualite/4390/guide-pratique.pdf) — **third-party training provider (LaComptaEnLive), hosted on ohada.com.** Source of the six-column requirement, the `Balance N` / cell A2 paste procedure, the decimal-root rule and the four-digit note. **Not a DGI specification.**
- [OHADA — Acte uniforme relatif au droit comptable et à l'information financière (AUDCIF)](https://www.ohada.org/acte-uniforme-relatif-au-droit-comptable-et-a-linformation-financiere-audcif/) — official framework; the authority against which the class table must be checked.
- [Sage KB — Exporter les données comptables de la ligne Sage 100 et 30](https://fr-kb.sage.com/portal/app/portlets/results/view2.jsp?k2dockey=211010150028688) — vendor: `Fichier > Exporter > Balance`, "Sage États financiers", `balance.txt`.
- [Sage KB — Exporter des éléments de la comptabilité sous différents formats](https://fr-kb.sage.com/portal/app/portlets/results/view2.jsp?k2dockey=211010150064573) — vendor: text, Excel, Sage HTML.
- [Sage KB — Exporter des états comptables au format Texte ou PDF](https://fr-kb.sage.com/portal/app/portlets/results/viewsolution.jsp?solutionid=221102151715407) — vendor.
- [Sage Community Hub — Sage 100 i7, export et extraction de données](https://communityhub.sage.com/fr/sage-100/f/sage-100-i7-discussion-generale/109351/export----sage-100-i7-et-extraction-de-donnees) — community: `États > Balance des comptes > Imprimer dans un fichier`; text, Excel or Sylk.
- [Sage documentation — Export de données, Sage Comptabilité i7](https://documentation.sage.fr/bupe/DOCS/Sage%20Comptabilit%C3%A9%20i7/Utilitaires/Export/Export_de_donn%C3%A9es.htm) — vendor.
- [IG Conseils — Exporter au format .csv avec les logiciels Sage](https://blog.ig-conseils.com/exporter-format-csv-logiciel-sage/) — secondary.
- [Compta Online — Export en format paramétrable sur Sage](https://www.compta-online.com/export-format-parametrable-sur-sage-t17544) — community: `.ema` parameterised export templates.
- [Compta Online — Export balance générale format Excel](https://www.compta-online.com/export-balance-generale-format-excel-sur-sage-1000-t38376) — community.
- [Elite Formation — Sage Saari course outline](https://www.eliteformation.net/electricite-energie/sage-saari-2/) — secondary: contains the "Exportation de la balance vers Excel" chapter.
- [Data Engineering Consulting — Sage 100 Comptabilité au Cameroun](https://dataengineeringconsulting.com/fr/services/erp_sage100Comptabilite.html) — vendor/integrator: Sage 100 configured to the SYSCOHADA chart locally.
- [OHADA — programme de formation SYSCOHADA révisé](https://www.ohada.com/uploads/actualite/3439/programme.pdf) — training programme: class 9 as off-balance-sheet commitments and analytical accounting.
- [MemoireOnline — OHADA accounting system thesis](https://www.memoireonline.com/11/22/13318/m_Optimisation-de-la-gestion-par-la-mise-en-place-de-la-comptabilit-financire-dans-une-pme-ca15.html) — **secondary student work**: nine decimal classes, 1–8 general accounting, 9 commitments and analytical. Verify against AUDCIF.

> Claims attributed to commercial vendors and community posts are **not** authoritative.
> Per blueprint §13, regulatory content must be revalidated against official current
> sources before implementation or use.
