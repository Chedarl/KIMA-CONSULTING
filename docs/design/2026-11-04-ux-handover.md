# UX/UI work in progress — how it is being run

4 November 2026. Written so somebody else can pick this up mid-flight and work
the same way. `2026-11-04-journey-model-and-dashboard.md` says **what** to
build; this says **how the work is run**. Read that one first.

---

## 1. The method, in order

Every screen goes through the same six steps. Skipping step 1 or step 5 is how
this project previously produced work that looked finished and was not.

1. **Read the product before the reference.** Open `lib/`, the migrations and
   the relevant spec in the owner's screen-spec set. Three times now the thing
   that looked like a missing feature was a defect in something that already
   existed — the CRM was "missing" because an RLS policy hid it, not because it
   was unbuilt.
2. **Interrogate the reference.** The owner supplies TaxDome, HubSpot, Dribbble
   and Pinterest designs. Ask of each element: *does this serve follow-up and
   tax compliance?* Take the structure, reject what fights the product. Worked
   examples in §4.
3. **Build the smallest honest increment**, as one coherent change.
4. **Verify in a browser.** Not a typecheck. `npm run dev`, load the route,
   look at it.
5. **Run the ECC reviewers and the UI/UX skill.**
6. **PR with evidence**, and state what you could *not* verify.

## 2. Rules that decide arguments

In priority order. A lower rule never overrides a higher one.

1. `CLAUDE.md` — product hard constraints. The four axes, three verdicts,
   filing evidence, no invented rules, tenant isolation.
2. `AGENTS.md` — path ownership, gates, never merge without owner approval.
3. The owner's UX principles (`00-ux-principles.md` in the supplied spec set) —
   colour, honest status words, progressive disclosure.
4. `docs/design/2026-11-04-journey-model-and-dashboard.md` — the current design.
5. The reference products — last, and only where they do not contradict 1–4.

## 3. Vocabulary — use these words

| Say | Not | What it is |
|---|---|---|
| **Parcours / Journey** | pipeline | the stage sequence work moves through |
| **Dossier / Job** | deal, case | one obligation × period travelling a journey |
| **Tâche / Task** | — | a step inside a job, with an owner |

A journey is the stage template, a job is a `compliance_cases` row, a task is a
`case_tasks` row. **No migration is needed for this rename.**

## 4. Design calls already made — and why

Do not silently reverse these; argue them with the owner first.

- **One balance is forbidden.** Every reference portal shows a single
  "Outstanding Balance". Firm fees and government tax are separate concepts, so
  the portal shows fees only and says so. Tax paid to the DGI is *absent*, not
  zero — KIMA is not connected and a zero reads as "nothing owed".
- **Unknown is never zero.** A figure that failed to load renders an em dash
  with an `sr-only` reason. Applies to money, counts, everything.
- **Returned ≠ refused.** `Renvoyé` is indigo and carries a motif: the work came
  back to be corrected. `Rejeté` is a different outcome. `StatusPill` keeps
  them apart.
- **Estimated is dashed.** A provisional date and a statutory one must not look
  alike. 1 obligation in 14 is verified; the UI says so.
- **Gold is a shape colour.** `gold` (#C9A227) for the logo node and section
  rules only. Gold *text* is `gold-text` (#8A6D12) — 4.9:1 on white, **4.4:1 on
  `surface-sunken`, so never on a sunken surface**.
- **Rejected from the references:** withholding a client's document until an
  invoice is paid (a collections lever that blocks compliance), and promotional
  banners on a surface carrying statutory dates.

## 5. Primitives — use them, don't re-roll them

- `components/ui/status-pill.tsx` — the only status pill. Tones say what a
  state *is*: `confirmed · awaiting · attention · estimated · neutral ·
  returned · refused`. Each domain maps its own statuses **once**, not per call
  site.
- `components/ui/section-heading.tsx` — section title + gold rule.
- `components/client-portal/action-queue.tsx` — grouped "à traiter".
- `components/client-portal/portal-aside.tsx` — quick actions + fees owed.
- `components/client-portal/my-obligations.tsx` — obligations per taxpayer.
- `lib/workspace-nav.ts` — the firm rail's single source of truth.

**Legacy, being retired:** `components/client-portal/ui.tsx` exports `Pill`,
which takes a raw colour. Six call sites remain in `components/live/`;
`scripts/status-pill-ratchet.mjs` holds the count and only lets it fall. Two of
those six are risky — `documents-panel.tsx:342` paints *received* and *accepted*
both green, and `payments-panel.tsx:312` paints *settled* green.

## 6. Guards that will catch you

In `npm test`: `workspace-nav-check` (no orphaned screens), `status-pill-ratchet`,
`money-honesty-check`, `dashboard-freshness-check`, `stat-tile-scope-check`,
`portal-audience-voice-check`. They are source-assertion scripts in the style of
`light-scope-tokens-check.mjs`. Add one with every behavioural fix.

## 7. Traps hit this session — do not re-learn these

- **Stale `.next`.** Running `npm run build` while `next dev` is up corrupts the
  dev server's chunks: routes 500 with `Cannot find module './NNNN.js'`. Restart
  dev. It is not a product defect.
- **Server → client function props.** Passing a formatter from a page to a
  `"use client"` component compiles and *builds*, then fails at runtime. Pass
  strings. Only the browser catches it.
- **Squash-merging a base closes its stacked PRs.** Retarget the child to `main`
  **before** merging the parent with `--delete-branch`. Cost two PRs (#377, #385).
- **The size gate counts changed lines, 300 max** — lock files excluded since
  #384. Split before you write, not after.
- **`test:portal:firm-scope` fails on Windows** — its regex uses `\n` against a
  CRLF checkout. It passes in Linux CI. Not a defect.
- **Verify compiled CSS, not source.** Adding the `gold` token gave a
  pre-existing `text-gold` usage a 2.3:1 colour. Source looked fine.

## 8. State

**On `main`:** contacts RLS fix · rail 21→9 + orphan guard · dashboard filter
and outage fixes · unavailable≠zero · portal audience voice · semantic
StatusPill · CRM contacts object · UI direction doc · PR-gate fix.

**Open:** #389 (gold tokens, action queue, portal home, aside) → #390
(individual portal obligations), stacked in that order.

**Next, in the owner's order:** business portal → firm portal → **account
switcher** on `contact_account_links` (one person, several tax files; all three
reference portals have it and KIMA does not).

**Unverified and should be:** an individual and a business portal rendered side
by side. The difference is data-driven through `obligationsFor(type, regime)`,
but nobody has watched the two differ.
