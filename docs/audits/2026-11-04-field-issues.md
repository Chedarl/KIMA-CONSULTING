# Field report — 4 November 2026

Five issues were raised from Cameroon while the same build rendered correctly in the US.
Each is listed with its evidence, its cause, and the sub-tasks that close it.

## 1. A region sees older screens than another region (URGENT — fixed)

**Evidence.** Production responded with `x-vercel-cache: PRERENDER` and
`cache-control: public, max-age=0, must-revalidate`. A prerendered shell can be
held by an edge or an ISP cache far from the build; that is exactly how one region
sees this week's dashboard and another sees an older one.

**Fix (merged #363).** `app/[locale]/layout.tsx` now exports
`dynamic = "force-dynamic"`. Every request renders the current build.

**Verified after deploy.** `x-vercel-cache: MISS`,
`cache-control: private, no-cache, no-store, max-age=0, must-revalidate`,
`x-matched-path: /[locale]/workspace`, and the current KPI and module labels are
in the HTML.

**Remaining sub-tasks.** None for the app. If a device still shows old screens after
this deploy, the browser or the ISP is caching the document; a hard refresh clears it.

## 2. Screens feel static and do not react (URGENT — in progress)

**Cause.** Several screens fetch once on mount and never again; only the dashboard
and the document inbox subscribed to realtime.

**Done.** The workflows board now subscribes to `compliance_cases` and refetches on
insert, update and delete (#363).

**Sub-tasks.**
- Clients list, billing, calendar, capacity and time: subscribe or refetch on focus.
- A shared `kima:refresh` event on `visibilitychange`, so returning to a tab refetches.
- A test: change a case elsewhere, assert the board moves without a reload.

## 3. Redundancy — a senior analyst asked for fewer, better items (URGENT)

**Cause.** The workspace nav grew to 27 entries as features landed; the spec's
information architecture is 10.

**Sub-tasks.**
- Merge case work: `/workflows`, `/tasks`, `/queue` and `/cases` are four entrances
  to the same `compliance_cases` table. Keep `/workflows` (board) and `/cases/[id]`
  (record); turn `/tasks` and `/queue` into views of the board, not separate pages.
- Merge client work: `/clients`, `/engagements`, `/templates` stay; `/leads` stays as
  the CRM intake; `/staff` and `/capacity` merge into one team screen.
- Merge compliance: `/calendar`, `/dsf`, `/declarations` are three views of the same
  obligations. Keep `/calendar` and `/dsf`; fold `/declarations` into `/dsf`.
- Merge firm admin: `/filing`, `/reports`, `/routing`, `/kyc`, `/incidents` are
  admin surfaces; keep them under a single "Cabinet" group with tabs.

## 4. CRM is missing on every side (URGENT)

**Cause.** The CRM data exists (`contacts`, `contact_links`, `leads`), and
`/workspace/clients` shows the accounts, but there is no single CRM surface and no
nav entry that says so.

**Sub-tasks.**
- A CRM hub: accounts, contacts, leads and the intake queue in one screen.
- Contacts on the client record with their links to accounts (data exists).
- Portal side: the client sees their own contacts and who at the firm owns them.

## 5. Kima AI perceived as defunct (VERIFIED WORKING)

**Evidence.** `POST /api/assistant/ask` answers with a cited, grounded reply in
production (200), and `/fr/workspace/ai` renders the composer, Suggestions and
Sources utilisées panels. The earlier failure was the stale deployment of issue 1.

**Sub-tasks.**
- A production smoke test in CI that posts one question and asserts a citation.
- Surface the refusal boundary in the UI when the model is unreachable.
