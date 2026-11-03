-- T-275 .. T-281: a client is revoked, and comes back (R-59, step 3 of 3).
--
-- The owner's 31 Oct decision, walked end to end through the real functions
-- rather than asserted at the schema level. Steps 1 and 2 are the schema rule
-- and the two function fixes; this is the journey they exist for, and it is
-- the test that would have caught the original defect, which no test did.
--
-- Before those three changes a firm could not take its own former client back
-- by ANY route: a second row was refused by UNIQUE (organization_id,
-- taxpayer_id), un-revoking was refused by the guard, and setting the status
-- back left a row reading `authorized` with revoked_at set that granted
-- nothing. The last of those is why T-279 checks ACCESS and not just rows: a
-- re-engagement that produces a row but no access is the failure that hid
-- behind the original one.
--
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e400-00000000a001', 'partner@return.test');
insert into organizations (id, name) values
  ('00000000-0000-4000-e400-00000000a010', 'Returning Journey Firm');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id)
values ('00000000-0000-4000-e400-00000000a020',
        '00000000-0000-4000-e400-00000000a010', 'Journey Partner',
        'partner@return.test', 'firm_partner', '00000000-0000-4000-e400-00000000a001');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e400-00000000a001","role":"authenticated"}', true);

-- The firm takes the client on.
create temporary table rj as
  select taxpayer_id as id from open_client_file(
    p_legal_name => 'Boulangerie Retour SARL',
    p_taxpayer_type => 'sarl',
    p_niu => 'P0RETOUR00001',
    p_requests => '[]'::jsonb,
    p_note => 'Dossier ouvert / File opened');

-- T-275
select is(
  (select count(*) from taxpayers t join rj on rj.id = t.id),
  1::bigint,
  'T-275 the firm takes the client on and can read the file'
);
reset role;

-- The relationship ends.
update engagements set status = 'revoked', revoked_at = now()
 where taxpayer_id = (select id from rj);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e400-00000000a001","role":"authenticated"}', true);

-- T-276 and the access goes with it. If this ever reads 1, revocation has
-- stopped meaning anything and the rest of this file is measuring nothing.
select is(
  (select count(*) from taxpayers t join rj on rj.id = t.id),
  0::bigint,
  'T-276 revoking ends the firm''s access to the file'
);

-- Months later the client comes back, and the firm types the same NIU.
select is(
  (select outcome from open_client_file(
     p_legal_name => 'Boulangerie Retour SARL',
     p_niu => 'P0RETOUR00001',
     p_requests => '[]'::jsonb,
     p_note => 'Le client revient / The client returns')),
  'already_registered',
  'T-277 the client comes back and the NIU is recognised'
);
reset role;

-- T-278 a FRESH engagement, alongside the closed one. Before step 1 this was
-- 1 row and the firm was handed the revoked engagement back.
select is(
  (select count(*)::text || ' (' || string_agg(status, ',' order by status) || ')'
     from engagements e join rj on rj.id = e.taxpayer_id),
  '2 (draft,revoked)',
  'T-278 and gets a fresh draft alongside the closed engagement'
);

-- The firm authorises the new engagement. Nothing else holds this client, and
-- its own revoked row is excluded from "held by another firm", so rule 3 of
-- 20261030070000 lets it act alone.
update engagements set status = 'authorized', authorized_at = now()
 where taxpayer_id = (select id from rj) and revoked_at is null;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e400-00000000a001","role":"authenticated"}', true);

-- T-279 the point of the whole decision: the access is real again. A row
-- without access is the failure the original defect hid behind, so this
-- asserts the read, not the row.
select is(
  (select count(*) from taxpayers t join rj on rj.id = t.id),
  1::bigint,
  'T-279 and once authorised the firm can read the client file again'
);
reset role;

-- T-280 the history is intact: the closed engagement is still there, still
-- revoked, still carrying the date it ended. Coming back must not rewrite it.
select is(
  (select e.status || ' / ' || (e.revoked_at is not null)::text ||
          ' / ' || (e.authorized_at is not null)::text
     from engagements e join rj on rj.id = e.taxpayer_id
    where e.revoked_at is not null),
  'revoked / true / true',
  'T-280 and the closed engagement is untouched, dates and all'
);

-- T-281 and the rule that still holds: one LIVE engagement, not two.
--
-- Inserted as a DRAFT on purpose. The first version of this assertion tried to
-- insert an already-authorised row and got 42501 — "an engagement opens as a
-- draft; authorising it is a separate act" — which is the F-01 rule refusing
-- it before the index is ever consulted. That would have passed as a 'throws'
-- while testing the wrong layer entirely. A draft is permitted by F-01 and has
-- revoked_at null, so it is the partial index, and only the partial index,
-- that can refuse it.
select throws_ok(
  $$ insert into engagements (organization_id, taxpayer_id)
     values ('00000000-0000-4000-e400-00000000a010', (select id from rj)) $$,
  '23505', null,
  'T-281 while the firm still cannot hold two live engagements at once'
);

select * from finish();
rollback;
