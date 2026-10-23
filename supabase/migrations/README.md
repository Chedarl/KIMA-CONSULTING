# Migrations

The database of record is the Supabase project `kima-consulting`
(`vhrnrbnjhmxrygvyfirf`, eu-west-3). Every version in
`supabase_migrations.schema_migrations` has a file here named
`<version>_<name>.sql`. `supabase db push` matches on that version prefix and
skips versions the server already recorded, so these files do not re-apply the
live schema.

The filenames are the list. Confirm them against the project rather than
against a table copied into this file:

```bash
supabase migration list --linked
```

## How this directory was reconciled

Migrations were first applied through the Supabase management tools, which
record the version on the server and do not write a file. A later export used
guessed timestamps. `db push` on `main` (Actions run 39904684722) refused to
run because those remote versions were missing locally.

The statements were read back from `supabase_migrations.schema_migrations` and
saved under the versions the server actually stored. History was not repaired
with `migration repair --status reverted`. That deletes the remote rows; the
next push would then try to create objects that already exist.

Versions that moved:

| Was committed as | Applied as | Name |
|---|---|---|
| `20261022192100` | `20261022192235` | `registration_kpis_runs_as_the_caller` |
| `20261022213000` (one file) | `20261023010535` … `20261023010729` (eight files) | auth close-out, in the parts the server accepted |
| `20261022214500` | `20261023010824` | `portal_accounts_otp_columns_are_actually_unreadable` |
| `20261022215000` | `20261023011145` | `demo_anon_switch_lives_in_a_table_not_a_guc` |
| `20261023050000` | `20261023044730` | `intake_updates_and_stop_activity_writes` |

`20261022213000` was one script. The tooling refused the single call twice
(`Invalid or expired requestState` — a payload-size limit, not a SQL error)
and nothing was applied either time. The server then recorded eight versions:
`auth_closeout_1a` through `1e`, `2a`, `2b`, and `3`. Those eight files are
the record of execution.

## The one version the server does not have yet

`20261023052142_document_acceptance_snapshot.sql` adds nullable
`documents.acceptance`. The inbox writes that column; the column is not on the
Paris project. The statement used to be `20261023031000`, which was never
applied and which sorts before the latest applied version (`20261023044730`).
`db push` rejects that shape unless `--include-all` is set, and the production
workflow does not set it. The file was recreated with `supabase migration new`
so it sorts after every applied version and the workflow can apply it in order.

The statement is `add column if not exists` plus a comment. A failed verdict
does not delete the document: the row stays, with the defect stated. Accepting
a request remains a separate later act. Receiving a file is not accepting it.

`supabase db push --dry-run` against the linked project should name only this
version.

## Cautions

- These files are a **record of what was applied**, replayed in order on a
  clean database. Do not assume a second run against a database that already
  applied them is safe: `db push` skips by version, it does not re-execute.
- `revoke select (column)` on a table that has a table-wide SELECT grant is
  accepted and does nothing. Revoke the table grant, then grant the columns —
  and check `information_schema.column_privileges` afterwards.
- **A column revoke that was a no-op left the OTP hash readable.** It happened
  on `portal_accounts` in `20261023010709`: anon could still read `otp_hash`
  after the revoke ran, and an 8-digit code behind `sha256(code || id)` is
  recoverable offline in seconds. Fixed in `20261023010824`. After any grant
  change, query `information_schema.column_privileges` and look.
- **`create or replace function` cannot widen OUT parameters** (42P13). A
  migration that adds a column to a function's returned table must drop the
  function first. `20261023010535` does that for the OTP functions.
- **A switch needs a handle.** `20261023010647` gated the demo-anon branch
  behind a GUC to be set with `alter database … set`. Managed Supabase roles
  may not set database or role parameters, so the gate could never be opened;
  `20261023011145` moved the flag into `app_flags`. Prefer a row over a GUC for
  anything an operator is expected to change. `allow_demo_anon` must stay false
  before any real taxpayer data exists (R-32).
- **The server assigns the version of a migration it applies.** Read the
  version back from `supabase_migrations.schema_migrations` before naming the
  file. A filename that disagrees with the recorded version is worse than no
  file, because `db push` will try to run it again.

## Why the files are in the pull request

RLS policies and CHECK constraints are where this product's correctness lives —
tenant isolation, the evidence rule for a filed declaration, the separation
between a document received and a document accepted. A reviewer who cannot read
them cannot check them.
