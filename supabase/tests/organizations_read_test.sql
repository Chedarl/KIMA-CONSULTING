-- T-128 .. T-137: a firm's name is public, its record is not (R-55).
--
-- `20261030130000` replaces `demo_read_orgs` (`for select using (true)`, no role
-- named) with two scoped policies and one public lookup. The assertions come in
-- three kinds, and the third is the one that would have caught this being
-- written as a lock-down: the owner decided names stay public, so a visitor
-- reading no names is a failure here, not a success.
--
--   T-128 .. T-130  the table: anon reads nothing, a firm reads itself only
--   T-131 .. T-133  the client's side, including a revoked engagement
--   T-134 .. T-137  the lookup: it answers, and it answers two columns
--   T-138          the query two live components actually send
--
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

-- Two firms, one taxpayer held by Firm G, one client of it, and a client of
-- nobody whose engagement was revoked.
insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-00000000f001', 'member-g@example.test'),
  ('00000000-0000-4000-b000-00000000f002', 'client-g@example.test'),
  ('00000000-0000-4000-b000-00000000f003', 'client-x@example.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-b000-00000000f010', 'Firm G'),
  ('00000000-0000-4000-b000-00000000f011', 'Firm H');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-b000-00000000f020', 'Client of Firm G'),
  ('00000000-0000-4000-b000-00000000f021', 'Former client of Firm H');

insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-b000-00000000f010', '00000000-0000-4000-b000-00000000f020',
   'authorized', now());

insert into engagements (organization_id, taxpayer_id, status, authorized_at, revoked_at) values
  ('00000000-0000-4000-b000-00000000f011', '00000000-0000-4000-b000-00000000f021',
   'revoked', now() - interval '1 year', now() - interval '1 day');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-b000-00000000f030', '00000000-0000-4000-b000-00000000f010',
   'Member G', 'member-g@example.test', 'firm_partner',
   '00000000-0000-4000-b000-00000000f001');

insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-b000-00000000f040', '00000000-0000-4000-b000-00000000f010',
   'Client G', 'client-g@example.test', '00000000-0000-4000-b000-00000000f002'),
  ('00000000-0000-4000-b000-00000000f041', '00000000-0000-4000-b000-00000000f011',
   'Client X', 'client-x@example.test', '00000000-0000-4000-b000-00000000f003');

insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access) values
  ('00000000-0000-4000-b000-00000000f040', '00000000-0000-4000-b000-00000000f020',
   'owner', true),
  ('00000000-0000-4000-b000-00000000f041', '00000000-0000-4000-b000-00000000f021',
   'owner', true);

update app_flags set enabled = false where key = 'allow_demo_anon';

-- ---------------------------------------------------------------------------
-- The table.
-- ---------------------------------------------------------------------------

-- `set local role` changes the role and not the identity: request.jwt.claims is
-- transaction-local and survives it, so every anon section clears the claims.
select set_config('request.jwt.claims', '', true);
set local role anon;

-- T-128
select is(
  (select count(*) from organizations), 0::bigint,
  'T-128 an anonymous visitor reads no organisation row at all'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b000-00000000f001","role":"authenticated"}', true);

-- T-129 the whole record, which is the half the owner asked to keep inside the
-- firm: country and created_at come back, not just the name.
select is(
  (select name || '/' || country || '/' || (created_at is not null)::text
     from organizations where id = '00000000-0000-4000-b000-00000000f010'),
  'Firm G/CM/true',
  'T-129 a firm member reads its own record whole'
);

-- T-130
select is(
  (select count(*) from organizations
    where id = '00000000-0000-4000-b000-00000000f011'),
  0::bigint,
  'T-130 and never another firm''s record'
);
reset role;

-- ---------------------------------------------------------------------------
-- The client's side. The portal writes the holding firm's id on every message.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b000-00000000f002","role":"authenticated"}', true);

-- T-131
select is(
  (select coalesce(string_agg(name, ','), '(none)') from organizations),
  'Firm G',
  'T-131 a client reads the firm engaged with them, and only that one'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b000-00000000f003","role":"authenticated"}', true);

-- T-132 a revoked engagement is history, not a relationship.
select is(
  (select count(*) from organizations), 0::bigint,
  'T-132 a client whose engagement was revoked reads no firm'
);

-- T-133 the control that keeps T-132 honest: the lookup still answers them, so
-- a former client can still choose a firm.
select is(
  (select count(*) from public.firm_directory()), 2::bigint,
  'T-133 control: the same client still reads both names through the lookup'
);
reset role;

-- ---------------------------------------------------------------------------
-- The lookup.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;

-- T-134
select is(
  (select string_agg(name, ',' order by name) from public.firm_directory()),
  'Firm G,Firm H',
  'T-134 an anonymous visitor reads every firm''s name through the lookup'
);
reset role;

-- T-135 and nothing else: the return type is the disclosure, so pin it.
select is(
  (select pg_get_function_result(p.oid)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'firm_directory'),
  'TABLE(id uuid, name text)',
  'T-135 the lookup returns two columns, so country and created_at cannot leak'
);

-- T-136 no arguments, so there is nothing for a caller to steer.
select is(
  (select coalesce(p.pronargs::int, -1)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'firm_directory'),
  0,
  'T-136 the lookup takes no arguments'
);

-- T-137 the open rule is gone, by name. A policy left behind would make every
-- assertion above pass for the wrong reason.
select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'organizations'
      and policyname = 'demo_read_orgs'),
  0::bigint,
  'T-137 demo_read_orgs no longer exists'
);

-- ---------------------------------------------------------------------------
-- The query two live components actually send.
-- ---------------------------------------------------------------------------
-- `organizations … limit(1)` in components/live/case-detail.tsx and
-- components/live/message-thread.tsx was written against a single-firm
-- database, and `demo_read_orgs` named `anon` only -- so for a signed-in caller
-- it returned nothing, and both paths broke on it: the new-document-request
-- flow threw `no organization`, and the client portal's message send was held
-- behind a null org id. Measured, not reasoned about: T-129 and T-131 fail
-- without this migration because the row is unreadable, not because it is the
-- wrong row. With the policies above, `limit(1)` returns the caller's own firm,
-- so the assumption is retired rather than relied on.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b000-00000000f001","role":"authenticated"}', true);

-- T-138
select is(
  (select name from organizations limit 1),
  'Firm G',
  'T-138 `organizations limit(1)` now answers the caller''s own firm'
);
reset role;

select * from finish();
rollback;
