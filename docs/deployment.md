# Deployment

How a commit reaches production. Two independent pipelines, deliberately not
coupled: Vercel deploys code, GitHub Actions applies database migrations.

**Status of the migration pipeline:** it has run, and it has not yet changed
the database. GitHub Actions run
[39904684722](https://github.com/Chedarl/KIMA-CONSULTING/actions/runs/39904684722)
on `main` linked the Paris project, then `supabase db push` exited before
applying anything:

```text
Remote migration versions not found in local migrations directory.
```

Secrets and `supabase link` succeeded. The remote history contained versions
with no `.sql` file in the repository, and several files that were here used
timestamps the server had never recorded. The CLI stops in that state so it
does not apply a local history that has diverged from production.

Those applied statements are now in `supabase/migrations/` under the version
numbers stored in `supabase_migrations.schema_migrations`. `db push` skips a
version it already finds there, so pushing these files does not re-run the SQL
that created the live schema. History was not rewritten with
`supabase migration repair --status reverted`. That command deletes rows from
the remote history table; the next push would then try to create objects that
already exist.

**Filename versions are the identity.** `db push` compares the timestamp prefix
of each local file with the versions already recorded remotely. The same SQL
under a fresh timestamp is new work. On a database that already has the
objects, that push fails on the first `create table` — or, worse, succeeds at
something destructive. Keep the recorded version. Read it back from
`supabase_migrations.schema_migrations` before naming a file that has already
been applied.

One file is newer than every version on the server:
`20261023052142_document_acceptance_snapshot.sql`. It adds the nullable
`documents.acceptance` column the inbox already writes, and states that a
failed verdict does not remove the row. The column is not on the Paris project.
The same statement used to live at `20261023031000`, which is before the latest
applied version (`20261023044730`). `db push` refuses a local file inserted
before the last remote version unless `--include-all` is passed, and this
workflow does not pass it. The statement moved forward so the workflow can
apply it in order. It is `add column if not exists` plus a comment.

Confirm before relying on the workflow:

```bash
supabase migration list --linked   # every remote version present locally
supabase db push --dry-run         # should name only 20261023052142
```

The authoritative list is that command, not a table copied into this document.
`supabase/migrations/README.md` records how the filenames were reconciled.

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

Both skip cleanly while `supabase/migrations/` holds no `.sql` files, so a
doc-only push does not go red for lack of SQL. PR #1 confirmed that skip. SQL
is present now, so the verify job replays the full history on a pull request
and `db push` runs on `main`.

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

### Repository secrets the workflow reads

Run 39904684722 passed the secret check and `supabase link`. Both values are
set on the repository. The job then failed on migration history, which is the
gap closed above. To rotate either secret, repeat these steps:

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

### SQL negative tests

`supabase/tests/*.sql` are pgTAP tests (T-01 … T-14 in
`docs/audits/2026-10-27-taxdome-parity/security-and-integrity-review.md` §4): storage
paths, which events, messages and documents a client or firm member may write, the
delivery check, and the sign-in code rules. The verify workflow runs them with
`supabase test db` against the throwaway local stack, after the replay. Locally:
`supabase start && supabase test db` (needs Docker). They never touch production.

## Deploy the auth-codes Edge Function

> **Needs an owner go. Nobody deploys this without one.** Merging the PR that changes
> `supabase/functions/auth-codes/index.ts` does not deploy it: no workflow deploys Edge
> Functions.

`supabase/functions/auth-codes/index.ts` is the source of the `auth-codes` Edge
Function. Version 3 in production was deployed by hand and was in no repository; the
committed source is v3 plus the binding check (a refused or empty
`firm_members`/`contacts.auth_user_id` PATCH now returns `binding_failed` instead of a
token) and no internal error text in responses. The Next.js sign-in routes relay to it
through `lib/auth-codes.ts` when `SUPABASE_SERVICE_ROLE_KEY` is not set on Vercel, so
the service-role key stays inside Supabase.

When the owner approves, from a checkout of the approved commit:

```bash
# 1. Compare with what is live (read-only), and keep a copy of v3.
supabase functions download auth-codes --project-ref vhrnrbnjhmxrygvyfirf

# 2. Deploy. verify_jwt stays off: the caller is not signed in yet; possession
#    of the one-time code is the authentication.
supabase functions deploy auth-codes --project-ref vhrnrbnjhmxrygvyfirf --no-verify-jwt
```

Then check it:
- a synthetic firm member (`*@demo.kima.cm`) signs in and the response carries a
  `tokenHash`;
- a code is shown on screen only for `demo.kima.cm` / `example.*` addresses with
  `app_flags.demo_otp_reveal` on, never for a real address;
- the function's logs show no `bind …` errors.

Secrets it reads (set in Supabase, never in the repo): `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (injected by Supabase), `RESEND_API_KEY`, `KIMA_MAIL_FROM`.

**Rollback.** No verbatim copy of v3 exists: not in the repository, not in any local
checkout, and no file was kept from the download. The nearest text is in git history:
`supabase/functions/auth-codes/index.ts` at `63582e2` / `2254cc9` (#13) is v3 plus the
binding check and the error-text change, and `5a188c1` (#15) differs from it only in the
header comment. Rolling back to v3 itself is **not advised**: v3 answered ok after a
refused identity binding. The rollback target is the file at `5a188c1`, the same as the
live v5. Before the next deploy, run step 1 and keep the download under
`docs/deployment-artifacts/auth-codes/v<N>/` (or attach it to the PR) so that a real
copy of the version being replaced exists.

### auth-codes version history (read-only check, 27 Oct 2026, Agent A)

What the platform shows (`list_edge_functions`, `get_edge_function`, function logs):

| Version | When (UTC) | From where | Evidence |
|---|---|---|---|
| 1 | 23 Oct, 04:05 (function created 04:05:37) | By hand, no repository | Function logs: deployment `…_1` booted 04:06–04:08, curl requests |
| 2 | 23 Oct, by 04:12 | By hand, no repository | Function logs: deployment `…_2` booted 04:12, requests from `node` |
| 3 | Between 23 Oct 04:13 and 27 Oct 18:30 | By hand, no repository | Fetched read-only on 27 Oct (#13 header). No request served by v3 appears in the retained logs (23–27 Oct) |
| 4 | **Could not determine.** Between the v3 fetch (27 Oct, before 18:30, the time of commit `63582e2`) and 19:24:19 | **Could not determine.** Not from CI: no workflow deploys Edge Functions (`.github/workflows/` has none). So by hand (CLI, dashboard or MCP) | No v4 request in the function logs; the platform keeps no per-version deploy record that the read-only tools expose |
| 5 | 27 Oct, 19:24:19 (`updated_at`) | This file, with the owner's go | Booted 19:24:34; served the post-deploy check (one 200, one 400). Source equals `index.ts` at `5a188c1` (below) |

The most likely reading, unproven: v4 and v5 were both deploys in the same session on
27 Oct (a first deploy attempt, then a redeploy). The person who ran the 27 Oct deploy
can confirm. Until then, v4 stays "unexplained, superseded".

**v5 equals the repository.** The live source (`get_edge_function`, one file
`index.ts`) was saved and compared with `supabase/functions/auth-codes/index.ts` at
`main` (`8bb83cb`, same blob as `5a188c1`) after normalising line endings: `diff` finds
no difference, and both have sha256 `58e82a01…a716613` with LF endings. The repository
blob is stored with LF; the Windows checkout shows CRLF only because of `core.autocrlf`.

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
