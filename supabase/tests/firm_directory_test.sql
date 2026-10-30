-- T-95 .. T-101: a firm's staff directory belongs to that firm (R-53).
--
-- Two firms, two members each, and a visitor with no session. Before
-- 20261030090000 the SELECT policy on firm_members read `using (true)` with no
-- role named, so every caller -- signed in or not -- read every firm's staff.
--
-- Run against the schema without the migration, **all seven fail**:
--
--   T-95   have: Dir Orphan, Dir Partner A, Dir Partner B, Dir Reviewer A,
--                Dir Reviewer B, Irina
--          want: Dir Partner A, Dir Reviewer A
--   T-96   have: 2   want: 0      -- Firm A counting Firm B's staff
--   T-97   have: Dir Partner B, Dir Reviewer B    want: (none)
--   T-98   have: 6   want: 0      -- a member of no firm reading everyone
--   T-99   have: 2   want: 0      -- the same leak from Firm B's side
--   T-100  have: 6   want: 0      -- a visitor with no session reading the lot
--   T-101  have: ... the whole list ...           want: (none)
--
-- Six rather than five because the fixture's five members sit alongside
-- 'Irina', seeded by 20261022142916 and belonging to no organisation.
--
-- T-95 and T-98 are the controls that stop "refuse everything" from passing.
-- Note that both fail before the migration too, for opposite reasons: T-95
-- because it asserts "and only those", and T-98 because reading nobody is the
-- new behaviour, not the old one. So this file has no assertion that passes
-- either side, and every line of it is load-bearing.
--
-- T-98 pins a deliberate consequence rather than an accident: keying on the
-- organisation puts a member with none outside every firm's directory,
-- including their own view of it. Rows in that shape exist in the live data.
--
-- The column grants are a separate defence and are asserted in T-91 of
-- firm_identity_test.sql, not here: this file is about which rows, not which
-- columns.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixture: two firms, two staff each, plus one member with no organisation.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-d000-0000000000a1', 'partner-a@dir.test'),
  ('00000000-0000-4000-d000-0000000000a3', 'reviewer-a@dir.test'),
  ('00000000-0000-4000-d000-0000000000b1', 'partner-b@dir.test'),
  ('00000000-0000-4000-d000-0000000000b3', 'reviewer-b@dir.test'),
  ('00000000-0000-4000-d000-0000000000c1', 'orphan@dir.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-d000-0000000000a0', 'Directory Firm A'),
  ('00000000-0000-4000-d000-0000000000b0', 'Directory Firm B');

insert into firm_members
  (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-d000-0000000000a2', '00000000-0000-4000-d000-0000000000a0',
   'Dir Partner A', 'partner-a@dir.test', 'firm_partner',
   '00000000-0000-4000-d000-0000000000a1'),
  ('00000000-0000-4000-d000-0000000000a4', '00000000-0000-4000-d000-0000000000a0',
   'Dir Reviewer A', 'reviewer-a@dir.test', 'firm_reviewer',
   '00000000-0000-4000-d000-0000000000a3'),
  ('00000000-0000-4000-d000-0000000000b2', '00000000-0000-4000-d000-0000000000b0',
   'Dir Partner B', 'partner-b@dir.test', 'firm_partner',
   '00000000-0000-4000-d000-0000000000b1'),
  ('00000000-0000-4000-d000-0000000000b4', '00000000-0000-4000-d000-0000000000b0',
   'Dir Reviewer B', 'reviewer-b@dir.test', 'firm_reviewer',
   '00000000-0000-4000-d000-0000000000b3'),
  -- No organisation. Earlier migrations seed rows in this shape, so the state
  -- is reachable and has to be safe rather than merely forbidden. See T-98.
  ('00000000-0000-4000-d000-0000000000c2', null,
   'Dir Orphan', 'orphan@dir.test', 'firm_partner',
   '00000000-0000-4000-d000-0000000000c1');

-- ---------------------------------------------------------------------------
-- As Firm A's partner.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-d000-0000000000a1","role":"authenticated"}', true);

-- T-95 control: the staff picker in case-detail.tsx and reviews-panel.tsx
-- reads the directory with no organisation filter and expects colleagues.
select is(
  (select string_agg(person_label, ', ' order by person_label) from firm_members),
  'Dir Partner A, Dir Reviewer A',
  'T-95 control: a firm member reads their own firm''s staff, and only those'
);

-- T-96 the defect, from Firm A's side.
select is(
  (select count(*) from firm_members
    where organization_id = '00000000-0000-4000-d000-0000000000b0'),
  0::bigint,
  'T-96 Firm A cannot see Firm B''s staff'
);

-- T-97 and not by name either, which is what a count alone would not show.
select is(
  (select coalesce(string_agg(person_label, ', ' order by person_label), '(none)')
     from firm_members
    where person_label like 'Dir % B'),
  '(none)',
  'T-97 and reads none of Firm B''s staff names'
);

reset role;

-- ---------------------------------------------------------------------------
-- As the member who belongs to no firm.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-d000-0000000000c1","role":"authenticated"}', true);

-- T-98 nobody, including themselves. Keying on the organisation means a row
-- with none is outside every firm's directory, which is the right answer and
-- is recorded here so it is a decision rather than a surprise.
select is(
  (select count(*) from firm_members),
  0::bigint,
  'T-98 a member with no organisation reads no staff row at all'
);

reset role;

-- ---------------------------------------------------------------------------
-- As Firm B's reviewer. The mirror of T-96, so the rule is not one-sided.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-d000-0000000000b3","role":"authenticated"}', true);

select is(
  (select count(*) from firm_members
    where organization_id = '00000000-0000-4000-d000-0000000000a0'),
  0::bigint,
  'T-99 Firm B cannot see Firm A''s staff'
);

reset role;

-- ---------------------------------------------------------------------------
-- As a visitor with no session. The owner's second condition: people who are
-- not signed in get nothing.
--
-- `anon` is refused by having no policy at all rather than by a false
-- predicate, so this is RLS returning no rows, not the helper answering.
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*) from firm_members),
  0::bigint,
  'T-100 someone not signed in reads no staff row'
);

-- T-101 the whole directory, counted without a WHERE, which is the shape the
-- leak actually had: `select * from firm_members` from a browser.
select is(
  (select coalesce(string_agg(person_label, ', ' order by person_label), '(none)')
     from firm_members),
  '(none)',
  'T-101 and the directory as a whole is empty to them'
);

reset role;

select * from finish();
rollback;
