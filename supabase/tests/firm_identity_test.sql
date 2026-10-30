-- T-87 .. T-94: a firm member is identified by their login, not their name.
--
-- The fixture is the case that could not exist before 20261030080000: two
-- firms, each employing a "Marie Atangana". T-87 is the fixture succeeding,
-- and it is an assertion rather than a bare insert for that reason.
--
-- Run against the schema without 20261030080000, six of the eight fail:
--
--   T-87  died: 23505 duplicate key ... "firm_members_person"
--         -- the platform-wide index refusing the second firm's hire, which is
--            the phase 2 breakage in one line
--   T-88  no exception was raised -- Firm A has no Marie at all, because T-87
--         could not create one
--   T-89  have: 0   want: 1      -- and so the identity resolves to nobody
--   T-90, T-92, T-94 follow from those.
--
-- T-91 and T-93 pass before and after, and must: auth_user_id was already
-- unreadable, and the audit policy already refused an outsider -- by the
-- organisation check, not by the name, which is exactly why matching on the
-- name looked safe. T-93 now holds for the right reason.
--
-- T-89 and T-90 are the point: with the name ambiguous, the identity still
-- resolves to exactly one member, and it is the right one. Before the change
-- `current_firm_intake_identity()` matched on the name and would have returned
-- both firms' Maries, leaving components/live/intake-panel.tsx to pick `[0]`.
--
-- T-92 and T-93 are the audit binding, which had the same name match: a member
-- cannot attribute an audit event to anyone but themselves, and the same-named
-- member of the other firm is the case that proves it is the login and not the
-- name doing the work.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

-- ---------------------------------------------------------------------------
-- Fixture: one name, two firms, two logins.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-f000-0000000000a1', 'marie.a@firm-a.test'),
  ('00000000-0000-4000-f000-0000000000b1', 'marie.b@firm-b.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-f000-0000000000a0', 'Identity Firm A'),
  ('00000000-0000-4000-f000-0000000000b0', 'Identity Firm B');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-f000-00000000000a', 'Taxpayer of Identity Firm A');

insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-f000-0000000000a0', '00000000-0000-4000-f000-00000000000a',
   'authorized', now());

-- T-87 the fixture itself. This insert is 23505 before 20261030080000.
select lives_ok(
  $$ insert into firm_members
       (id, organization_id, person_label, email, role, auth_user_id) values
     ('00000000-0000-4000-f000-0000000000a2', '00000000-0000-4000-f000-0000000000a0',
      'Marie Atangana', 'marie.a@firm-a.test', 'firm_partner',
      '00000000-0000-4000-f000-0000000000a1'),
     ('00000000-0000-4000-f000-0000000000b2', '00000000-0000-4000-f000-0000000000b0',
      'Marie Atangana', 'marie.b@firm-b.test', 'firm_partner',
      '00000000-0000-4000-f000-0000000000b1') $$,
  'T-87 two firms may each employ a Marie Atangana'
);

-- T-88 and the name is still unique inside one firm, which is what
-- assigned_to, prepared_by and confirmed_by rely on (R-52).
select throws_ok(
  $$ insert into firm_members
       (organization_id, person_label, email, role) values
     ('00000000-0000-4000-f000-0000000000a0', ' marie atangana ',
      'other@firm-a.test', 'firm_staff') $$,
  '23505', null,
  'T-88 one firm cannot employ two Marie Atanganas, case and spacing included'
);

-- ---------------------------------------------------------------------------
-- As Firm A's Marie.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-f000-0000000000a1","role":"authenticated"}', true);

-- T-89 one row, not two. Keyed on the primary key, so the ambiguity in the
-- name cannot reach the caller.
select is(
  (select count(*) from current_firm_intake_identity()),
  1::bigint,
  'T-89 the intake identity returns exactly one member despite the shared name'
);

-- T-90 and it is Firm A's Marie, with Firm A's organisation.
select is(
  (select member_id::text || ' / ' || organization_id::text
     from current_firm_intake_identity()),
  '00000000-0000-4000-f000-0000000000a2 / 00000000-0000-4000-f000-0000000000a0',
  'T-90 and it is the caller''s own membership and own organisation'
);

-- T-91 the one thing the wrapper must never hand back. It is SECURITY INVOKER
-- and authenticated holds no SELECT on that column, so this is a privilege
-- refusal rather than an absent column.
select throws_ok(
  $$ select auth_user_id from firm_members
      where id = '00000000-0000-4000-f000-0000000000b2' $$,
  '42501', null,
  'T-91 auth_user_id stays unreadable to a signed-in firm member'
);

-- T-92 control: Marie A attributes an audit event to herself.
select lives_ok(
  $$ insert into audit_events
       (organization_id, taxpayer_id, actor, actor_member_id, action, resource_type)
     values ('00000000-0000-4000-f000-0000000000a0',
             '00000000-0000-4000-f000-00000000000a',
             'firm', '00000000-0000-4000-f000-0000000000a2',
             'document.accepted', 'document') $$,
  'T-92 control: a firm member attributes an audit event to themselves'
);

-- T-93 and not to the other firm's Marie. Before this migration the policy
-- matched on person_label, and the two labels are identical -- the only thing
-- that refused it was the organisation check. Now the login refuses it too.
select throws_ok(
  $$ insert into audit_events
       (organization_id, taxpayer_id, actor, actor_member_id, action, resource_type)
     values ('00000000-0000-4000-f000-0000000000a0',
             '00000000-0000-4000-f000-00000000000a',
             'firm', '00000000-0000-4000-f000-0000000000b2',
             'document.accepted', 'document') $$,
  '42501', null,
  'T-93 a firm member cannot attribute an audit event to a same-named outsider'
);

reset role;

-- ---------------------------------------------------------------------------
-- As Firm B's Marie. The same name, a different login, a different answer.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-f000-0000000000b1","role":"authenticated"}', true);

-- T-94 the other half of T-90. If identity came from the name, these two
-- callers would be indistinguishable.
select is(
  (select member_id::text || ' / ' || organization_id::text
     from current_firm_intake_identity()),
  '00000000-0000-4000-f000-0000000000b2 / 00000000-0000-4000-f000-0000000000b0',
  'T-94 the same name on a different login resolves to the other firm'
);

reset role;

select * from finish();
rollback;
