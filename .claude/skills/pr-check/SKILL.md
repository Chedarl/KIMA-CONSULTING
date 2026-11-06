---
name: pr-check
description: Check a KIMA OS branch against this repository's merge gates before opening or merging the pull request.
disable-model-invocation: true
---

# Pull request check

Run this before you open a pull request, and again before anyone merges it.

## 1. The gates that must be green

```bash
npm run typecheck
npm run lint
npm test
npm run test:journey
```

`npm test` is the gate: it runs the jurisdiction clock, the engine, DSF,
Clarity, the phase checks, the grant RPC refusal test, the status pill ratchet,
dashboard freshness, workspace nav, money honesty, the stat tiles and the
portal voice. If a check fails, fix it. Do not skip it and do not weaken the
check to make it pass.

Run `npm run test:marketing` as well when the change touches
`components/marketing/**` or the public pages, and
`npm run test:portal:firm-scope` when it touches the client portal.

## 2. The size gate

The change must be under **300 changed lines**.

```bash
git diff origin/main..HEAD --stat | tail -1
```

If it is over, split it. A larger change is not reviewable at the standard this
product needs.

## 3. Path ownership

`AGENTS.md` gives one writer per path. Check that every file you touched
belongs to you:

```bash
git diff origin/main..HEAD --name-only
```

`supabase/**`, `app/api/**`, `lib/auth-*.ts`, `lib/portal-auth.ts`,
`lib/firm-auth.ts`, `lib/supabase*.ts`, `lib/permissions.ts`, `lib/db-write.ts`,
`lib/events.ts` and the status functions in `lib/cases.ts` are **Agent A only**.
`components/**`, `app/[locale]/**` pages and `lib/i18n*.ts` are **Agent B**.

Agent A may touch an Agent B path only to fix a security or honesty defect, in
its own pull request, announced in a handoff note under
`docs/agents/handoffs/`. If you are in the wrong path, move the change to a
handoff note and let the owning agent write it.

## 4. The definition of done

For any screen change, work through
`docs/design/2026-11-05-ux-redo-goal.md`. The `kima-screen-reviewer` subagent
checks it item by item; dispatch it rather than doing it from memory.

## 5. The description

State what the change does, and state **what you could not verify**. If you did
not open a browser at 375, 768, 1024 and 1440 px, say so. If you did not check
a contrast ratio, say so. An unverified claim in a pull request description is
the defect this product can least afford.

## 6. Before the merge

`check` and, when the change touches `supabase/**`, `Verify migrations`, must
both be green **for that exact head**:

```bash
gh pr checks <number>
```

The owner's standing instruction of 5 November 2026 is to merge a green,
reviewed pull request without asking again. "Reviewed" means a review exists,
not that the checks passed.

## 7. After the merge

Verify the change actually reached production:

- the `Supabase migrations` workflow applied, if there was a migration;
- the Vercel production deployment succeeded;
- the production URL answers.

A failing check after a merge is fixed, not bypassed.
