# Migrations

**Status: partial export (13 of 29). Do not treat this directory as the whole schema yet.**

The database of record is the Supabase project `kima-consulting`
(`vhrnrbnjhmxrygvyfirf`, eu-west-3). Migrations were applied through the
Supabase MCP tool, which stores them in `supabase_migrations.schema_migrations`
rather than in this repo — so for most of them, **the policy text exists only in
the database and cannot be reviewed in a pull request.** That is the gap this
directory is closing.

## What is exported

| Version | Name | Here? |
|---|---|---|
| 20261021031500 | `kima_core_schema` | ⬜ |
| 20261021031559 | `demo_access_policies` | ⬜ |
| 20261021031616 | `realtime_and_storage` | ⬜ |
| 20261021032505 | `fix_policy_recursion` | ⬜ |
| 20261021034146 | `onboarding_and_diagnostics` | ⬜ |
| 20261021034903 | `harden_definer_function` | ⬜ |
| 20261021075805 | `messages_hardening` | ⬜ |
| 20261021082559 | `invoices_and_service_payments` | ⬜ |
| 20261021083943 | `work_queue_assignee` | ⬜ |
| 20261021184952 | `taxpayer_type_and_document_verdicts` | ⬜ |
| 20261021185533 | `portal_sign_in_demo` | ⬜ |
| 20261022065033 | `crm_contacts_links_and_tags` | ⬜ |
| 20261022070431 | `client_registration_and_portal_accounts` | ⬜ |
| 20261022083443 | `registration_intake_channel` | ⬜ |
| 20261022090028 | `compliance_cases` | ⬜ |
| 20261022122925 | `restore_execute_on_demo_taxpayer_id` | ⬜ |
| 20261022125435 | `four_status_dimensions` | ✅ |
| 20261022131746 | `engagement_scope_and_case_chain` | ✅ |
| 20261022134744 | `case_event_log_and_request_case_chain` | ✅ |
| 20261022134826 | `case_events_revoke_truncate` | ✅ |
| 20261022142916 | `firm_members_and_separation_of_duties` | ✅ |
| 20261022143324 | `event_kind_self_approval_disclosed` | ✅ |
| 20261022163432 | `firm_members_hide_email_from_clients` | ✅ |
| 20261022163452 | `firm_members_column_grants_for_email` | ✅ |
| 20261022180415 | `auth_identities_and_structural_permissions` | ✅ |
| 20261022181457 | `scope_every_policy_to_the_caller` | ✅ |
| 20261022181734 | `portal_one_time_code_replaces_niu_password` | ✅ |
| 20261022192100 | `registration_kpis_runs_as_the_caller` | ✅ |
| 20261022213000 | `auth_closeout_otp_and_capability_writes` | ✅ |

## Finishing the export

Each file is `<version>_<name>.sql`, matching what was applied. To export the
rest, run this against the project and write each row to its file:

```sql
select version || '_' || name as fname,
       array_to_string(statements, E';\n\n') || ';' as sql
from supabase_migrations.schema_migrations
order by version;
```

Four cautions learned while exporting the eleven below:

- `array_to_string(...) || ';'` appends a semicolon to statements that already
  end in one, producing a trailing `;;`. Strip it.
- These files are a **record of what was applied**, not a replayable baseline.
  Several use bare `create type` and would fail on a second run; the earlier
  ones wrap it in `do $$ ... exception when duplicate_object` and would not.
  Do not assume `supabase db reset` works until that has been tested.
- `revoke select (column)` on a table that has a table-wide SELECT grant is
  accepted and does nothing. Revoke the table grant, then grant the columns —
  and check `information_schema.column_privileges` afterwards rather than
  trusting the statement to have worked.
- **The server assigns the version, not you.** Two files here were first
  written under guessed timestamps and had to be renamed. Read the version
  back from `supabase_migrations.schema_migrations` before naming the file:
  a filename that disagrees with the recorded version is worse than no file,
  because it looks authoritative.

## Why it matters here

RLS policies and CHECK constraints are where this product's correctness lives —
tenant isolation, the evidence rule for a filed declaration, the client-facing
visibility whitelist. A reviewer who cannot read them cannot check them.
