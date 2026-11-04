# UX/UI consolidation — status and per-screen checklist

Date: 3 November 2026. Companion to the KIMA Design Language doc. This records
what the app-wide redesign has consolidated and what remains, screen by screen,
so the work is reviewable rather than open-ended.

## 1. Consolidated (shared system in use)

- PageHeading (title + lede + actions) — used by brand studio, templates.
- Card / CardHeader / StatusChip / Button / Money / Metric / DueBadge /
  PendingAction / PageHeading — the shared ui.tsx kit.
- Theme layer: accent/logo/sender/slug via ThemeRoot + BrandMark, KIMA default.
- Command palette, attention rail, work drawer, Kanban/List, saved views.

## 2. Per-screen checklist (firm workspace)

| Screen | Header | Cards | Status |
|---|---|---|---|
| overview (dashboard) | greeting | tiles/rail/pipeline/money | done |
| leads | onboarding wizard | cards | ok |
| routing | — | cards | ok |
| clients | onboarding wizard | list/empty/skeleton | ok |
| client 360 | dynamic name | tabs | done |
| staff | — | cards | ok |
| engagements | — | cards | ok |
| queue / tasks / incidents / reviews | — | cards | ok |
| inbox / dsf / kyc | — | cards | ok |
| cases (case-detail) | back + name + lede + signed-in | cards | ok |
| messages / filing / declarations / calendar / vault / billing / reports / settings | — | cards | ok |
| branding | PageHeading | cards | done |
| templates | PageHeading + actions | cards | done |

## 3. Per-screen checklist (client portal)

| Screen | Header | Cards | Status |
|---|---|---|---|
| client home | welcome + live | four zones + quick actions | done |
| client service | dynamic name | cards | ok |
| client records / documents panel | dynamic | cards | ok |

## 4. Remaining polish (bounded, low risk)

1. Move the case-detail and client-service dynamic headers onto the PageHeading
   pattern where they do not lose the back link or signed-in block.
2. One shared empty-state component (icon + title + hint + action) replacing
   the per-screen empty paragraphs.
3. One shared skeleton row component.
4. Consistent focus ring (already via --navy outline) audited on inputs.
5. Branding subdomain + sender DNS activation (owner DNS step).

## 5. Definition of done for the redesign

The redesign is done when: every screen reaches the shared PageHeading/Card/
empty-state system; the theme resolves from the firm branding with the KIMA
default; and the dual-account Playwright journey stays green. Items in section
4 are the remaining bounded steps.
