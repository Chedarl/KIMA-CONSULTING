# Deployment

How a commit reaches production. Two independent pipelines, deliberately not
coupled: Vercel deploys code, GitHub Actions applies database migrations.

**Status of this document:** the pipeline described here is configured but
unexercised — there is no application code and no migration in the repository
yet, so nothing has deployed through it. Treat the behaviour below as intended,
not observed, until the first real change goes through.

## Infrastructure

| Thing | Value |
|---|---|
| GitHub repository | `Chedarl/KIMA-CONSULTING` |
| Vercel team | `urbannightlift` |
| Vercel project | `kima-consulting` (`prj_mxSUe3HKvDWGzgj6X1UpBAf7VPH2`) |
| Supabase project | `kima-consulting`, ref `vhrnrbnjhmxrygvyfirf` |
| Supabase region | `eu-west-3` (Paris) |
| Supabase plan | Free |

Paris was chosen over the US regions on two grounds: latency from Cameroon, and
a defensible hosting jurisdiction under Law No. 2024/017. **An EU region is not
compliance.** The legal review in `docs/foundation/risk-register.md` still
stands on its own — region choice only avoids making it harder to answer.

Supabase project regions are immutable. Changing it means a new project and a
data migration.

## Code: Vercel

Already wired through Vercel's native Git integration, and nothing in this
repository configures it:

- push to `main` → production deployment
- push to any other branch → preview deployment
- pull request → preview deployment, URL commented on the PR

**Do not add a Vercel step to a GitHub Actions workflow.** The Git integration
already deploys; a workflow that also deploys produces two deployments per push
and a race over which one holds the alias.

### Environment variables

Set on the Vercel project, scoped to production, preview and development:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://vhrnrbnjhmxrygvyfirf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | modern `sb_publishable_…` key, preferred |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | legacy JWT, for libraries expecting this name |

The service-role key is deliberately **not** set. It bypasses row-level
security entirely, so it is only added when server-side code genuinely needs
it, as `sensitive`, and never with a `NEXT_PUBLIC_` prefix.

## Database: GitHub Actions

Two workflows:

**`.github/workflows/supabase-verify.yml`** — on pull requests touching
`supabase/**`. Replays every migration from scratch against a throwaway local
Postgres, replays a second time to catch migrations that are not re-runnable,
and checks that the committed migrations fully describe the schema they produce.

**`.github/workflows/supabase-migrations.yml`** — on push to `main` touching
`supabase/**`. Links the production project and runs `supabase db push`.
Concurrency is set so a migration is never cancelled mid-flight.

Both skip cleanly while `supabase/migrations/` holds no `.sql` files, so neither
goes red on doc-only pushes. Confirmed on PR #1: the verify job ran and passed
with no migrations present.

### The Supabase GitHub App is also connected

PR #1 received a third-party check run named **Supabase Preview**, concluding
`skipped`, pointing at this project's integrations settings. So the Supabase
GitHub App has access to this repository independently of the workflows above —
most likely installed account-wide for an earlier project rather than set up
for this one.

It is inert today: Supabase branching requires a paid plan, so the check skips.
**But it stops being inert the moment the plan is upgraded.** Native branching
also applies migrations when a PR merges, which would mean two mechanisms
applying the same migrations to the same database. Supabase records which
migrations have been applied, so the second should no-op rather than double-run,
but the two racing is not a situation to discover during an incident.

Before enabling branching, pick one mechanism and disable the other: either
remove `supabase-migrations.yml` and let branching own production, or disconnect
the repository under Project Settings → Integrations. Not both.

Worth confirming the App's current scope in the dashboard — the evidence here is
one skipped check run, not a read of the integration settings.

### Three manual steps before the migration workflow can run

It will fail with an explicit error until these are done.

**1. Get a database password.** The project was created with a generated
password that was never displayed, so there is nothing to copy. Reset it:
Supabase dashboard → Project Settings → Database → Reset database password.
Copy the new value.

**2. Get a Supabase access token.** Supabase dashboard → Account → Access
Tokens → Generate new token.

**3. Add both as repository secrets.** GitHub → Settings → Secrets and
variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `SUPABASE_DB_PASSWORD` | from step 1 |
| `SUPABASE_ACCESS_TOKEN` | from step 2 |

The project ref is not a secret and is set directly in the workflow.

### Optional: an approval gate, with no code change

The migration job targets a GitHub environment named `production`. As shipped,
with no environment configured, **it runs fully automatically** — a push to
`main` applies migrations with no human in the loop.

To require a click first: GitHub → Settings → Environments → New environment →
name it `production` → enable **Required reviewers** and add yourself. The job
then waits for approval.

Worth doing, because of the next section.

## Risks

**Migrations are irreversible and the free plan has no point-in-time
recovery.** `supabase db push` is forward-only. A migration that drops a column
on a database holding taxpayer financial records cannot be undone by
redeploying, and on the free plan there is no automated restore point to fall
back to. This is the reason the verify workflow and the optional approval gate
exist, and the strongest argument for moving to a paid plan before real client
data lands. Conflicts with the "preserve originals" constraint in `CLAUDE.md`.

**Preview deployments read and write the production database.** The Supabase
environment variables are scoped to all three Vercel targets, so every preview
build points at the Paris production project. Any branch can write to real
data. Acceptable while the database is empty; **not** acceptable once it holds
taxpayer records. Two ways out: a separate staging Supabase project with its own
variables scoped to preview and development, or Supabase branching, which gives
each PR its own database but requires a paid plan.

**The free plan pauses a project after 7 days of inactivity.** A paused project
refuses connections, so both the application and the migration workflow fail
until it is restored from the dashboard. A quiet week is enough to trigger it.

**The CLI version is unpinned.** Both workflows install `version: latest`, so a
CLI release can change behaviour without any commit here. Pin to a known-good
version once the first migration has gone through successfully.

**Deployment protection is on.** The Vercel project has SSO protection enabled
for everything except custom domains, so `kima-consulting.vercel.app` requires a
Vercel login. This must come off before any public marketing site or client
portal, and before preview URLs can be shared with pilot users.

## Local development

```bash
supabase start                       # local stack, applies all migrations
supabase migration new <description> # create a migration
supabase db reset                    # replay from scratch
supabase stop
```

Requires Docker. Never point local development at the production project — use
the local stack, and keep the production ref out of `.env` files.
