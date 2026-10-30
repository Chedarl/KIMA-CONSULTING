-- Phase 3 invitation lifecycle and tenant isolation (all synthetic, rollback).
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(13);

insert into auth.users(id,email) values
 ('00000000-0000-4000-a000-00000000e901','p3-firm-a@example.test'),
 ('00000000-0000-4000-a000-00000000e902','p3-firm-b@example.test'),
 ('00000000-0000-4000-a000-00000000e903','p3-client@example.test'),
 ('00000000-0000-4000-a000-00000000e904','p3-stranger@example.test');
insert into organizations(id,name,kind) values
 ('00000000-0000-4000-a000-00000000e911','P3 Firm A','firm'),
 ('00000000-0000-4000-a000-00000000e912','P3 Firm B','firm');
insert into taxpayers(id,legal_name) values
 ('00000000-0000-4000-a000-00000000e921','P3 Example Client');
insert into firm_members(id,organization_id,person_label,role,auth_user_id) values
 ('00000000-0000-4000-a000-00000000e931','00000000-0000-4000-a000-00000000e911','P3 Partner A','firm_partner','00000000-0000-4000-a000-00000000e901'),
 ('00000000-0000-4000-a000-00000000e932','00000000-0000-4000-a000-00000000e912','P3 Partner B','firm_partner','00000000-0000-4000-a000-00000000e902');
insert into contacts(id,organization_id,full_name,email,auth_user_id) values
 ('00000000-0000-4000-a000-00000000e941','00000000-0000-4000-a000-00000000e911','P3 Client','p3-client@example.test','00000000-0000-4000-a000-00000000e903');
insert into contact_account_links(contact_id,taxpayer_id,portal_access) values
 ('00000000-0000-4000-a000-00000000e941','00000000-0000-4000-a000-00000000e921',true);
insert into engagements(id,organization_id,taxpayer_id,status,authorized_at) values
 ('00000000-0000-4000-a000-00000000e951','00000000-0000-4000-a000-00000000e911','00000000-0000-4000-a000-00000000e921','draft',null);

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-a000-00000000e902","role":"authenticated"}',true);
select throws_ok(
 $$ select * from create_invitation_for_contact(
 '00000000-0000-4000-a000-00000000e951','p3-client@example.test') $$,
 '42501',null,'P3 foreign firm cannot invite from another firm engagement');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-a000-00000000e901","role":"authenticated"}',true);
select lives_ok(
 $$ select * from create_invitation_for_contact(
 '00000000-0000-4000-a000-00000000e951','p3-client@example.test') $$,
 'P3 home firm can invite registered linked contact');
select is(
 (select count(*) from engagement_invitations
 where organization_id='00000000-0000-4000-a000-00000000e911'
 and status='pending'),1::bigint,'P3 one pending invitation is stored');
select throws_ok(
 $$ update engagement_invitations set status='accepted'
 where organization_id='00000000-0000-4000-a000-00000000e911' $$,
 '42501',null,'P3 direct invitation status updates are denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-a000-00000000e904","role":"authenticated"}',true);
select is(
 (select count(*) from engagement_invitations),0::bigint,
 'P3 unrelated account cannot read invitation');
select throws_ok(
 $$ select decide_invitation(
 (select id from public.engagement_invitations
 where organization_id='00000000-0000-4000-a000-00000000e911'
 limit 1),'accepted') $$,
 '42501',null,'P3 unrelated actor cannot accept an invitation');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-a000-00000000e903","role":"authenticated"}',true);
select lives_ok(
 $$ select decide_invitation(
 (select id from engagement_invitations
 where organization_id='00000000-0000-4000-a000-00000000e911'
 limit 1),'accepted') $$,
 'P3 intended taxpayer accepts the firm invitation');
select throws_ok(
 $$ select decide_invitation(
 (select id from engagement_invitations
 where organization_id='00000000-0000-4000-a000-00000000e911'
 limit 1),'accepted') $$,
 '23514',null,'P3 second acceptance is a forbidden replay');
reset role;
select is(
 (select status from engagements
 where id='00000000-0000-4000-a000-00000000e951'),
 'accepted','P3 only accepted mandate becomes live');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-a000-00000000e903","role":"authenticated"}',true);
select lives_ok(
 $$ select * from create_invitation(
 'taxpayer_to_firm',
 '00000000-0000-4000-a000-00000000e912',
 '00000000-0000-4000-a000-00000000e921',null) $$,
 'P3 taxpayer may invite second accounting firm');
reset role;
select is(
 (select status from engagements where organization_id='00000000-0000-4000-a000-00000000e912'
 and taxpayer_id='00000000-0000-4000-a000-00000000e921'),
 'invited','P3 taxpayer invitation does not yet authorize firm B');
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-a000-00000000e902","role":"authenticated"}',true);
select lives_ok(
 $$ select decide_invitation(
 (select id from engagement_invitations
 where organization_id='00000000-0000-4000-a000-00000000e912' limit 1),
 'accepted') $$,'P3 recipient firm may accept mandate');
reset role;
select is(
 (select status from engagements where organization_id='00000000-0000-4000-a000-00000000e912'
 and taxpayer_id='00000000-0000-4000-a000-00000000e921'),
 'authorized','P3 accepted firm invitation becomes an authorized engagement');
select * from finish();
rollback;
