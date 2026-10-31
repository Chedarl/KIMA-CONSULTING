-- Phase 4: a delivered case's filing evidence is immutable (QA blocker).
-- The client signs a specific evidence reference; after delivery no actor may
-- swap it for something the client never approved. Synthetic, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-a000-00000000f201','lock-firm@example.test',now()),
('00000000-0000-4000-a000-00000000f202','lock-client@example.test',now());
insert into organizations(id,name) values
('00000000-0000-4000-a000-00000000f211','Lock Test Firm');
insert into taxpayers(id,legal_name) values
('00000000-0000-4000-a000-00000000f221','Lock Test Company');
insert into engagements(id,organization_id,taxpayer_id,status,authorized_at) values
('00000000-0000-4000-a000-00000000f231','00000000-0000-4000-a000-00000000f211',
 '00000000-0000-4000-a000-00000000f221','authorized',now());
insert into firm_members(id,organization_id,person_label,role,auth_user_id) values
('00000000-0000-4000-a000-00000000f241','00000000-0000-4000-a000-00000000f211',
 'Lock Partner','firm_partner','00000000-0000-4000-a000-00000000f201');
insert into contacts(id,organization_id,full_name,email,auth_user_id) values
('00000000-0000-4000-a000-00000000f251','00000000-0000-4000-a000-00000000f211',
 'Lock Client','lock-client@example.test','00000000-0000-4000-a000-00000000f202');
insert into contact_account_links(contact_id,taxpayer_id,portal_access) values
('00000000-0000-4000-a000-00000000f251','00000000-0000-4000-a000-00000000f221',true);
insert into compliance_cases(id,organization_id,taxpayer_id,engagement_id,obligation_code,period_token)
values
('00000000-0000-4000-a000-00000000f261','00000000-0000-4000-a000-00000000f211',
 '00000000-0000-4000-a000-00000000f221','00000000-0000-4000-a000-00000000f231',
 'patente','2026A');

-- Walk the case to client approval as the firm partner (setup, not under test).
set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f201","role":"authenticated"}',true);
update compliance_cases set stage='accounting' where id='00000000-0000-4000-a000-00000000f261';
update compliance_cases set stage='preparation' where id='00000000-0000-4000-a000-00000000f261';
update compliance_cases set stage='review' where id='00000000-0000-4000-a000-00000000f261';
update compliance_cases set stage='filing' where id='00000000-0000-4000-a000-00000000f261';
update compliance_cases set stage='evidence' where id='00000000-0000-4000-a000-00000000f261';

select lives_ok(
$$ update compliance_cases set stage='client_approval', filing_status='verified',
filing_evidence_ref='ACK-LOCK-1', filing_verified_at=now()
where id='00000000-0000-4000-a000-00000000f261' $$,
'Lock: verified filing enters client approval');
reset role;

-- The linked client signs THIS evidence reference.
set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f202","role":"authenticated"}',true);
select lives_ok(
$$ insert into case_client_approvals(case_id,approval_round,taxpayer_id,filing_evidence_ref,approved_by)
values('00000000-0000-4000-a000-00000000f261',1,
'00000000-0000-4000-a000-00000000f221','ACK-LOCK-1',
'00000000-0000-4000-a000-00000000f202') $$,
'Lock: client signs the specific evidence reference');
reset role;

-- Delivery matches the signature, then the case is terminal.
set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f201","role":"authenticated"}',true);
select lives_ok(
$$ update compliance_cases set stage='delivered', closed_at=now()
where id='00000000-0000-4000-a000-00000000f261' $$,
'Lock: signed case is delivered');

-- The hole: same-stage updates on a delivered case must not rewrite what the
-- client approved. All three must raise 23514.
select throws_ok(
$$ update compliance_cases set filing_evidence_ref='FORGED-9'
where id='00000000-0000-4000-a000-00000000f261' $$,
'23514', null,
'Lock: evidence reference cannot be swapped after delivery');
select throws_ok(
$$ update compliance_cases set filing_reference='FORGED-REF'
where id='00000000-0000-4000-a000-00000000f261' $$,
'23514', null,
'Lock: filing reference cannot be rewritten after delivery');
select throws_ok(
$$ update compliance_cases set filing_verified_at=now()+interval '1 day'
where id='00000000-0000-4000-a000-00000000f261' $$,
'23514', null,
'Lock: verification timestamp cannot be moved after delivery');

-- Control: non-evidence bookkeeping on a delivered case stays allowed.
select lives_ok(
$$ update compliance_cases set owner='Lock Partner A'
where id='00000000-0000-4000-a000-00000000f261' $$,
'Lock: non-evidence bookkeeping still allowed on a delivered case');

select * from finish();
rollback;
