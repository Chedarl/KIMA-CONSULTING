---
name: create-migration
description: Create a new Supabase migration for KIMA OS the forward-only way, with the checks this repository requires before it can be applied to production.
disable-model-invocation: true
---

# Create a migration

Migrations in this repository are **forward-only**, and the production Supabase
project has **no point-in-time recovery**. A migration that reaches `main` is
applied to production by the `Supabase migrations` workflow and cannot be
undone. Read `docs/deployment.md` before you start.

Never edit a migration file that is already on `origin/main`. The remote
database keeps the statements it was given; editing the file only makes the
repository disagree with production, and nothing detects the difference. A
correction is a new migration. The `.claude/hooks/protect-paths.mjs` hook
refuses such an edit.

## Who may do this

`supabase/**` belongs to **Agent A** (security and data integrity). See
`AGENTS.md`. If you are Agent B, do not write the migration: write a handoff
note under `docs/agents/handoffs/` describing the columns and constraints you
need, and let Agent A write it.

## Steps

1. **Name the file.** `supabase/migrations/<UTC timestamp>_<snake_case>.sql`,
   timestamp format `YYYYMMDDHHMMSS`. Confirm it sorts after every existing
   migration:

   ```bash
   ls supabase/migrations/ | tail -3
   ```

2. **Write it expand-only.** Add a column, a table, an index or a policy. Do
   not drop or rename anything in the same migration that starts using it: add
   the new shape, backfill, move the readers, and drop the old shape in a later
   migration once nothing reads it. A rename is a drop plus an add, so it needs
   the same three steps.

3. **Money and dates.** Amounts are integer minor units or `numeric`, never
   `float` or `double precision`. A regulatory date carries its effective date
   and its source; an unverified rule stays inactive.

4. **Tenant isolation.** Any new table holding taxpayer or firm data needs row
   level security enabled and a policy in the same migration. A table without a
   policy is readable by anyone with the anon key. Firm A must not reach Firm
   B's rows, and a taxpayer must not reach another taxpayer's rows by guessing
   an id.

5. **Index what the policy reads.** A policy that filters on a foreign key
   needs an index on that key, or every read does a sequential scan.

6. **A SECURITY DEFINER function ships with no `PUBLIC` grant.** Grant to the
   specific role. See commit `065cfe2` for why.

7. **Verify locally**, then run the repository's own checks:

   ```bash
   npm run typecheck
   npm test
   ```

8. **Open the pull request** on an `agent-a/*` branch. `Verify migrations` and
   `check` must both be green for that exact head before anyone merges. State
   in the description what the migration does, what it cannot undo, and what
   you could not verify.

## What to tell the owner

Say plainly, in the pull request, that the migration is irreversible and that
production has no point-in-time recovery, and that preview deployments
currently point at the production database. Both caveats are recorded in
`docs/deployment.md` and must be resolved before real taxpayer data lands.
