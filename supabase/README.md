# Supabase backend — demonstration project

**Project:** `kima-consulting` · ref `vhrnrbnjhmxrygvyfirf` · region **eu-west-3 (Paris)**

> **Synthetic data only.** Never write real taxpayer data to this project
> (risk R-32). The access model below is a demo posture, not production.

## Applied migrations

| Version | Name | What it does |
|---|---|---|
| 20261021031500 | `kima_core_schema` | Core tables from `docs/foundation/erd.md`, RLS enabled on all, `filed_requires_evidence` CHECK |
| 20261021031559 | `demo_access_policies` | First policies, scoped to the seeded taxpayer |
| 20261021031616 | `realtime_and_storage` | Realtime publication; private `kima-demo` bucket, 10 MB, mime allow-list |
| 20261021032505 | `fix_policy_recursion` | `demo_taxpayer_id()` made `security definer` — the policy had called a function that read the same table, causing infinite recursion and a 500 on every query |
| 20261021034146 | `onboarding_and_diagnostics` | `organizer_answers`, `validation_findings`, contact columns; **widened policies so onboarding can create taxpayers** |
| 20261021034903 | `harden_definer_function` | `search_path = ''`, execute revoked from anon |

The applied SQL is in `supabase/migrations/`, one file per version recorded on
the project. Review the policies there. A file whose timestamp is not in
`supabase_migrations.schema_migrations` is still pending; `db push` applies
only those.

## The one structural guarantee

```sql
constraint filed_requires_evidence check (
  state <> 'filed'
  or (evidence_reference is not null
      and evidence_captured_on is not null
      and evidence_source is not null)
)
```

A declaration cannot be recorded as filed without the evidence that proves it —
Scenario F holds against a direct SQL write, not merely against the interface.

## Security posture, stated honestly

An ECC security review of this backend (2026-10-21) returned: *acceptable for a
synthetic-data demo, blocking before any real taxpayer data.* The findings are
the review of the schema as it stood that day. Later files in
`supabase/migrations/` replaced several of the policies it describes. The live
posture is those files. The list below is kept so the original gaps are not
forgotten, not as a description of every policy that is in force now.

**What the review found the publishable key could do on 2026-10-21:** read every row
in the working tables, update any taxpayer, move any request to accepted or
returned, insert a declaration marked `filed` with fabricated evidence values,
forge `audit_events` rows, list and download every object in the storage
bucket, and insert rows without limit. All of it against fabricated data.

### Known gaps — all blocking before real data

| # | Gap | Severity |
|---|---|---|
| 1 | No tenant isolation: policies are permissive, not membership-scoped | Critical |
| 2 | Storage `select`/`insert` unscoped — any folder is listable and readable | Critical |
| 3 | No firm/taxpayer roles: `actor` is a client-claimed string, so anyone can perform firm actions | High |
| 4 | Audit is forgeable and written by client code, not by triggers | High |
| 5 | The `filed` CHECK proves the evidence fields are non-null, not that they are real | High |
| 6 | No rate limiting; unbounded inserts and uploads | Medium |
| 7 | Document metadata is client-claimed; the upload flow is non-transactional and swallows errors on the activity and audit inserts | Medium |

### Gate before any real taxpayer data

1. Supabase auth (anonymous sign-in at minimum), a `memberships` table, and
   policies written `to authenticated` against membership — never `using (true)`.
2. Storage policies keyed on `(storage.foldername(name))[1]` matching a
   taxpayer the caller belongs to; files served only by short-lived signed URL.
3. Firm actions restricted to a firm role; a taxpayer may only move a request
   from `requested` to `submitted`.
4. `audit_events` written by `after insert/update/delete` triggers using
   `auth.uid()`; insert, update and delete revoked from client roles.
5. Evidence reference as a foreign key to a real document row.
6. Upload registration, status change and audit in one transaction (RPC or
   Edge Function), with metadata derived from `storage.objects.metadata`.
7. Migrations in version control, plus an automated test proving a second
   tenant's JWT returns zero rows and zero objects.
8. This demo project kept separate from production.

## Outbound email (Resend)

`POST /api/inquiry` sends a client the list of documents still outstanding,
including the reason recorded against each. It takes a **taxpayer id, not an
address** — the recipient is read from the database, so the endpoint cannot be
used to mail arbitrary people from a public site.

| Variable | Where | Notes |
|---|---|---|
| `RESEND_API_KEY` | Vercel (sensitive) + `.env.local` | Server only. Never `NEXT_PUBLIC`. |
| `KIMA_MAIL_FROM` | Vercel + `.env.local` | Currently `onboarding@resend.dev` |

**Delivery is limited until a Kima domain is verified.** The only domain on the
Resend account is `urbannighlift.com`, whose status is `failed`, and it belongs
to a different business in any case. With the `onboarding@resend.dev` sender,
Resend delivers **only to the Resend account owner's own address** — mail to a
client address is accepted by the API and never arrives.

To lift this: add a Kima domain in Resend, publish the DNS records it gives
you, then set `KIMA_MAIL_FROM` to an address at that domain.
