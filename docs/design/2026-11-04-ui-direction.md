# KIMA OS — UI direction, 4 November 2026

Owner brief of 4 Nov: give the product the feel of four supplied references, study
how TaxDome, Senta and Pixie organise practice work, and reproduce what fits
KIMA's compliance model. This is the specification that follows. It is a
**proposal for approval**, not an approved change — per `AGENTS.md` a plan is a
documentation PR and the owner approves before building.

The palette is **not** reopened. `docs/strategy/2026-10-29-qa-and-adoption/plan.md`
§4.5 remains the authority: navy `#18243B`, indigo `#455DA8`, background
`#F7F9FC`, border `#DCE3EC`, body `#273248`, success `#15803D`.

## 1. The references, and what each one actually contributes

| Reference | Taken | Rejected |
|---|---|---|
| WizeTax / Cadabra, *Tax Management Platform* | Two date chips per work item — **internal target vs statutory due date**, each with days remaining. A six-item rail. Status as an explicit pill on the row, with the owner's avatar. A segmented `To do 12 / Done 3` count instead of two screens. | Its blue brand. Its "Daily Progress" donut as a primary element. |
| Aziz Howlader, *Finance Dashboard* | **A period selector on every money figure.** Count badges on rail items. A labelled horizontal-bar breakdown for liabilities by tax type. Status pills in a compact table with "View more" into the filtered queue. Account card pinned to the rail foot. | Cents styling (XAF has no minor unit in practice). Red/green deltas as decoration. |
| Mehedi Hasan Tuhin, *Multi-tenant Salon* | **Softly tinted KPI tiles**, each with its own coloured icon badge. A filled accent panel of two or three **quick actions**, each icon + title + one line. Grouped rail with disclosure. ~16px radius, generous spacing. | Pastel lilac/mint palette. Its purple accent. |
| *Task Management App* (Figma community) | Supplied for the client portal; task-card density and the single-next-action emphasis. | Consumer tone; the portal must stay plainer than the workspace. |

**The one pattern all four share** and KIMA lacks: *every number states what it
counts and over what period, next to a way to act on it.*

## 2. What the three practice tools do, and what KIMA takes

Labelled as **INFERRED** — this is product-pattern knowledge, not verified
research against current releases. Treat as a hypothesis to confirm before any
claim is made externally.

- **TaxDome** — client portal, document requests, pipelines, invoicing and
  e-signature in one account record. *Take:* the client record as the centre of
  gravity; a request the client can answer without training. *Reject:* its
  automation surface, which assumes a filing integration KIMA does not have.
- **Senta** — service templates that generate recurring jobs against statutory
  dates, with per-job task checklists. *Take:* service → recurring job → task,
  which KIMA already models as engagement → case → task. *Reject:* UK statutory
  calendars.
- **Pixie** — deliberately small: email in the workflow, simple client cards,
  few screens. *Take:* restraint. Pixie is the argument for nine rail entries
  rather than twenty-one.

**KIMA's own difference stays:** a document carries three verdicts; a
declaration is never "filed" because someone clicked; the four axes never
collapse. No reference models any of that, so no reference overrides it.

## 3. Component specification

### 3.1 Stat tile (KPI)
Icon in a tinted rounded square (tone per metric: indigo, teal, amber, success),
value at `text-2xl` in the display face, label under it, and a **scope line** —
"30 jours", "cumul exercice", "au 04/11". The scope line replaces the
references' `+12.5% from last month`: a delta is only drawn when a real prior
period has been read. Unavailable reads as an em dash with an `sr-only` word,
never `0` (shipped: PR #379). Whole tile is one link to the filtered queue.

### 3.2 Work row
Checkbox · title · one-line context · **two date chips** (internal target,
statutory due, each with days remaining and the statutory one marked when
prorogued per `lib/rules.ts`) · status pill · assignee · overflow. Risk tone on
the statutory chip only.

### 3.3 Next actions panel
One filled panel, two or three actions, each icon + title + one line. Replaces
the dashboard's current spread of entry points. Content is derived, never
decorative: if there is nothing to do, the panel says so.

### 3.4 Section tabs
Shipped (PR #376). Labelled `nav` + `aria-current`, never ARIA `tablist`.

### 3.5 Rail
Nine entries (shipped). Add **count badges** for Conformité (overdue),
Documents (awaiting review) and Missions (open) once each count has a single
authorised source. Account card pinned to the foot.

### 3.6 Breakdown bar
Label left, percentage right, thin tinted track. For obligations by tax type.
Preferred over any pie: it is readable at 375px and on a slow connection.

## 4. Rules this direction does not get to break

- Contrast ≥ 4.5:1 in both themes; focus rings visible; targets ≥ 44px;
  `prefers-reduced-motion` respected; verified at 375 / 768 / 1024 / 1440.
- FR and EN parity on every string introduced.
- The interface distinguishes confirmed, declared, estimated and awaiting
  review. A tint is never the only carrier of that meaning.
- No fabricated statistic, delta, or progress figure.
- The portal stays plainer than the workspace, and speaks to its audience
  (shipped: PR #378).

## 5. Sequence

1. Stat tile tone + scope line.
2. Next actions panel; remove the duplicated case listings from the dashboard.
3. Work row with the two date chips.
4. Rail count badges, once their sources are single and authorised.
5. Breakdown bar on Conformité.
6. Portal pass against the task-management reference.

Each is its own PR under the 300-line gate, each with FR/EN copy and a check.
