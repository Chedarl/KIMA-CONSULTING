-- T-270 .. T-274: a revoked engagement is history, not a slot (R-59, step 1).
--
-- The owner decided on 31 Oct that a former client can come back as a
-- brand-new engagement, and that the one-engagement rule applies only to
-- engagements that are not revoked. `UNIQUE (organization_id, taxpayer_id)`
-- made that impossible: it treated the pair as a slot fillable once, so a firm
-- could not re-engage its own former client by any route.
--
-- These assert the rule at the schema level, which is where step 1 lives. The
-- revoke-and-return journey is step 3's test; the function that creates the
-- fresh engagement is step 2.
--
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

insert into organizations (id, name) values
  ('00000000-0000-4000-e100-00000000a010', 'History Firm');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-e100-00000000a020', 'Returning Client');

-- T-270 the slot rule is gone, by name. Left in place, every assertion below
-- would pass for the wrong reason or not at all.
select is(
  (select count(*) from pg_constraint
    where conrelid = 'public.engagements'::regclass
      and conname = 'engagements_organization_id_taxpayer_id_key'),
  0::bigint,
  'T-270 the one-slot-per-firm-and-client constraint no longer exists'
);

-- T-271 and what replaced it is partial on revoked_at, not a plain unique.
select is(
  (select indexdef from pg_indexes
    where indexname = 'engagements_one_live_per_firm_and_client'),
  'CREATE UNIQUE INDEX engagements_one_live_per_firm_and_client ON public.engagements '
  'USING btree (organization_id, taxpayer_id) WHERE (revoked_at IS NULL)',
  'T-271 replaced by a unique index that applies only while not revoked'
);

-- A relationship with history: two closed episodes.
insert into engagements (id, organization_id, taxpayer_id, status, authorized_at, revoked_at)
values
  ('00000000-0000-4000-e100-00000000a031', '00000000-0000-4000-e100-00000000a010',
   '00000000-0000-4000-e100-00000000a020', 'revoked', now() - interval '2 years', now() - interval '18 months'),
  ('00000000-0000-4000-e100-00000000a032', '00000000-0000-4000-e100-00000000a010',
   '00000000-0000-4000-e100-00000000a020', 'revoked', now() - interval '1 year', now() - interval '6 months');

-- T-272 the point of the change: the same firm and client may hold several
-- closed engagements. Under the old constraint the second insert raised 23505.
select is(
  (select count(*) from engagements
    where organization_id = '00000000-0000-4000-e100-00000000a010'
      and taxpayer_id = '00000000-0000-4000-e100-00000000a020'),
  2::bigint,
  'T-272 a firm and client may hold several closed engagements'
);

-- T-273 and the client can come back: a live engagement alongside that history.
select lives_ok(
  $$ insert into engagements
       (id, organization_id, taxpayer_id, status, authorized_at)
     values ('00000000-0000-4000-e100-00000000a033',
             '00000000-0000-4000-e100-00000000a010',
             '00000000-0000-4000-e100-00000000a020', 'authorized', now()) $$,
  'T-273 and a former client can come back as a brand-new engagement'
);

-- T-274 while the rule that matters still holds: never two LIVE at once. If
-- this ever stops raising, the partial index has lost its predicate and a firm
-- can hold two concurrent engagements on one client.
select throws_ok(
  $$ insert into engagements
       (id, organization_id, taxpayer_id, status, authorized_at)
     values ('00000000-0000-4000-e100-00000000a034',
             '00000000-0000-4000-e100-00000000a010',
             '00000000-0000-4000-e100-00000000a020', 'authorized', now()) $$,
  '23505', null,
  'T-274 but never two live engagements on the same client at once'
);

select * from finish();
rollback;
