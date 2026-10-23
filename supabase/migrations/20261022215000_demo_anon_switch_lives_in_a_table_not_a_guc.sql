-- The demo-anon gate needed a handle somebody can actually reach.
--
-- 20261022213000 gated it behind `current_setting('app.allow_demo_anon')`, to
-- be turned on with `alter database … set`. On a managed Supabase project
-- neither the API role nor the dashboard SQL role may set a database or role
-- parameter: `alter database postgres set` is refused outright, and
-- `alter role anon set` fails silently. A switch nobody can move is not a
-- switch. It left the gate permanently off with no supported way to run the
-- synthetic demo, which invites the next person to "fix" it by deleting the
-- gate -- and that gate is what stands between a future real taxpayer and the
-- open internet.
--
-- So the flag becomes a row: default off, readable only through a
-- security-definer function, and turning it on is a deliberate, auditable
-- write that is still there to be found tomorrow.

create table if not exists app_flags (
  key text primary key,
  enabled boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

alter table app_flags enable row level security;
-- No policy, by design: nothing reads this table through PostgREST. The
-- function below is security definer and is the only reader.
revoke all on app_flags from anon, authenticated;

insert into app_flags (key, enabled, note)
values (
  'allow_demo_anon',
  false,
  'Lets an anonymous caller read the single synthetic demo taxpayer. MUST be false before any real taxpayer data exists (R-32).'
)
on conflict (key) do nothing;

create or replace function flag_enabled(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from app_flags where key = p_key), false)
$$;

revoke all on function flag_enabled(text) from public, anon, authenticated;

create or replace function can_see_taxpayer(tp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    member_has('case.view')
    or tp in (select client_taxpayer_ids())
    or (
      flag_enabled('allow_demo_anon')
      and auth.uid() is null
      and tp = demo_taxpayer_id()
    )
$$;

comment on function can_see_taxpayer(uuid) is
  'Tenant scoping. The demo anon branch requires app_flags.allow_demo_anon = true and must be false for real data (R-32).';
comment on table app_flags is
  'Operator switches. Default off. allow_demo_anon exists only for the synthetic demo.';
