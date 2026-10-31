-- Phase 4 negative acceptance tests; synthetic identities only, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(29);

insert into auth.users(id,email) values
('00000000-0000-4000-a000-00000000f101','p4-firm-a@example.test'),
('00000000-0000-4000-a000-00000000f102','p4-firm-b@example.test'),
('00000000-0000-4000-a000-00000000f103','p4-client@example.test'),
('00000000-0000-4000-a000-00000000f104','p4-stranger@example.test');
insert into organizations(id,name) values
('00000000-0000-4000-a000-00000000f111','P4 Test Firm A'),
('00000000-0000-4000-a000-00000000f112','P4 Test Firm B');
insert into taxpayers(id,legal_name) values
('00000000-0000-4000-a000-00000000f121','P4 Test Company'),
('00000000-0000-4000-a000-00000000f122','P4 Unlinked Company');
insert into engagements(id,organization_id,taxpayer_id,status,authorized_at) values
('00000000-0000-4000-a000-00000000f131','00000000-0000-4000-a000-00000000f111','00000000-0000-4000-a000-00000000f121','authorized',now()),
('00000000-0000-4000-a000-00000000f132','00000000-0000-4000-a000-00000000f112','00000000-0000-4000-a000-00000000f121','authorized',now()),
('00000000-0000-4000-a000-00000000f133','00000000-0000-4000-a000-00000000f111','00000000-0000-4000-a000-00000000f122','authorized',now());
insert into firm_members(id,organization_id,person_label,role,auth_user_id) values
('00000000-0000-4000-a000-00000000f141','00000000-0000-4000-a000-00000000f111','P4 Partner A','firm_partner','00000000-0000-4000-a000-00000000f101'),
('00000000-0000-4000-a000-00000000f142','00000000-0000-4000-a000-00000000f112','P4 Partner B','firm_partner','00000000-0000-4000-a000-00000000f102');
insert into contacts(id,organization_id,full_name,email,auth_user_id) values
('00000000-0000-4000-a000-00000000f151','00000000-0000-4000-a000-00000000f111','P4 Client','p4-client@example.test','00000000-0000-4000-a000-00000000f103');
insert into contact_account_links(contact_id,taxpayer_id,portal_access) values
('00000000-0000-4000-a000-00000000f151','00000000-0000-4000-a000-00000000f121',false);
insert into compliance_cases(id,organization_id,taxpayer_id,engagement_id,obligation_code,period_token) values
('00000000-0000-4000-a000-00000000f161','00000000-0000-4000-a000-00000000f111','00000000-0000-4000-a000-00000000f121','00000000-0000-4000-a000-00000000f131','patente','2026A'),
('00000000-0000-4000-a000-00000000f162','00000000-0000-4000-a000-00000000f111','00000000-0000-4000-a000-00000000f122','00000000-0000-4000-a000-00000000f133','patente','2026A'),
('00000000-0000-4000-a000-00000000f163','00000000-0000-4000-a000-00000000f112','00000000-0000-4000-a000-00000000f121','00000000-0000-4000-a000-00000000f132','tva','2026M10');

set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f101","role":"authenticated"}',true);

select throws_ok(
$$ update compliance_cases set stage='client_approval' where id='00000000-0000-4000-a000-00000000f161' $$,
'23514', null, 'P4 stage skips are rejected');

select lives_ok(
$sql$ update compliance_cases set stage='accounting' where id='00000000-0000-4000-a000-00000000f161' $sql$,
'P4 partner may enter accounting stage');
select lives_ok(
$sql$ update compliance_cases set stage='preparation' where id='00000000-0000-4000-a000-00000000f161' $sql$,
'P4 partner may enter preparation stage');
select lives_ok(
$sql$ update compliance_cases set stage='review' where id='00000000-0000-4000-a000-00000000f161' $sql$,
'P4 partner may enter review stage');
select lives_ok(
$sql$ update compliance_cases set stage='filing' where id='00000000-0000-4000-a000-00000000f161' $sql$,
'P4 partner may enter filing stage');
select lives_ok(
$sql$ update compliance_cases set stage='evidence' where id='00000000-0000-4000-a000-00000000f161' $sql$,
'P4 partner may enter evidence stage');

select throws_ok(
$$ update compliance_cases set stage='client_approval' where id='00000000-0000-4000-a000-00000000f161' $$,
'23514', null, 'P4 unverified filing cannot request client consent');

select lives_ok(
$$ update compliance_cases set stage='client_approval',filing_status='verified',
filing_evidence_ref='ACK-P4',filing_verified_at=now()
where id='00000000-0000-4000-a000-00000000f161' $$,
'P4 verified filing enters client approval');
select is(
(select approval_round from compliance_cases where id='00000000-0000-4000-a000-00000000f161'),
1, 'P4 approval round increases');

select throws_ok(
$$ update compliance_cases set stage='delivered',closed_at=now()
where id='00000000-0000-4000-a000-00000000f161' $$,
'23514', null, 'P4 delivery without signed consent is refused');

-- A firm partner cannot create a client signature by supplying the client's UUID.
select throws_ok(
$ insert into case_client_approvals(case_id,approval_round,taxpayer_id,filing_evidence_ref,approved_by)
values('00000000-0000-4000-a000-00000000f161',1,'00000000-0000-4000-a000-00000000f121','ACK-P4','00000000-0000-4000-a000-00000000f103') $,
'42501', null, 'P4 firm cannot impersonate client to forge consent');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f103","role":"authenticated"}',true);
select throws_ok(
$$ insert into case_client_approvals(case_id,approval_round,taxpayer_id,filing_evidence_ref,approved_by)
values('00000000-0000-4000-a000-00000000f161',1,'00000000-0000-4000-a000-00000000f121','ACK-P4','00000000-0000-4000-a000-00000000f103') $$,
'42501', null, 'P4 linked contact without portal access cannot approve');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f104","role":"authenticated"}',true);
select throws_ok(
$$ insert into case_client_approvals(case_id,approval_round,taxpayer_id,filing_evidence_ref,approved_by)
values('00000000-0000-4000-a000-00000000f161',1,'00000000-0000-4000-a000-00000000f121','ACK-P4','00000000-0000-4000-a000-00000000f104') $$,
'42501', null, 'P4 unrelated client cannot approve');
reset role;

update contact_account_links set portal_access=true
where contact_id='00000000-0000-4000-a000-00000000f151';
set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f103","role":"authenticated"}',true);
-- A linked contact's access to one taxpayer must not disclose another taxpayer
-- even when both companies engage the same accounting firm.
select is(
(select count(*) from compliance_cases where id='00000000-0000-4000-a000-00000000f161'),
1::bigint, 'P4 linked client reads own company case');
-- A client may see their taxpayer's cases across engaged firms; firms may not.
select is(
(select count(*) from compliance_cases where id='00000000-0000-4000-a000-00000000f163'),
1::bigint, 'P4 client reads own taxpayer case at second engaged firm');
select is(
(select count(*) from compliance_cases where id='00000000-0000-4000-a000-00000000f162'),
0::bigint, 'P4 linked client cannot read second taxpayer case at same firm');
-- Consent must bind to the current approval round and exact verified evidence.
select throws_ok(
$ insert into case_client_approvals(case_id,approval_round,taxpayer_id,filing_evidence_ref,approved_by)
values('00000000-0000-4000-a000-00000000f161',1,'00000000-0000-4000-a000-00000000f121','ACK-FORGED','00000000-0000-4000-a000-00000000f103') $,
'42501', null, 'P4 client cannot sign unverified evidence');
select throws_ok(
$ insert into case_client_approvals(case_id,approval_round,taxpayer_id,filing_evidence_ref,approved_by)
values('00000000-0000-4000-a000-00000000f161',2,'00000000-0000-4000-a000-00000000f121','ACK-P4','00000000-0000-4000-a000-00000000f103') $,
'42501', null, 'P4 client cannot sign a future approval round');
select lives_ok(
$$ insert into case_client_approvals(case_id,approval_round,taxpayer_id,filing_evidence_ref,approved_by)
values('00000000-0000-4000-a000-00000000f161',1,'00000000-0000-4000-a000-00000000f121','ACK-P4','00000000-0000-4000-a000-00000000f103') $$,
'P4 authenticated linked client may approve');
-- The authenticated client may append consent but cannot rewrite or remove it.
select throws_ok(
$ update case_client_approvals set filing_evidence_ref='ACK-FORGED'
where case_id='00000000-0000-4000-a000-00000000f161' $,
'42501', null, 'P4 client cannot rewrite a signed approval');
select throws_ok(
$ delete from case_client_approvals
where case_id='00000000-0000-4000-a000-00000000f161' $,
'42501', null, 'P4 client cannot delete a signed approval');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f102","role":"authenticated"}',true);
select is(
(select count(*) from compliance_cases where id='00000000-0000-4000-a000-00000000f161'),
0::bigint, 'P4 competing firm cannot read the case');
select is(
(select count(*) from compliance_cases where id='00000000-0000-4000-a000-00000000f162'),
0::bigint, 'P4 competing firm cannot read second taxpayer case');
select is(
(select count(*) from compliance_cases where id='00000000-0000-4000-a000-00000000f163'),
1::bigint, 'P4 second firm reads only its own case for shared taxpayer');
select is(
(select count(*) from case_client_approvals where case_id='00000000-0000-4000-a000-00000000f161'),
0::bigint, 'P4 second firm cannot read first firm client approval');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
'{"sub":"00000000-0000-4000-a000-00000000f101","role":"authenticated"}',true);
select is(
(select count(*) from compliance_cases where id='00000000-0000-4000-a000-00000000f162'),
1::bigint, 'P4 owner firm can read its second taxpayer case');
select is(
(select count(*) from compliance_cases where id='00000000-0000-4000-a000-00000000f163'),
0::bigint, 'P4 first firm cannot read second firm case for shared taxpayer');
select is(
(select count(*) from case_client_approvals where case_id='00000000-0000-4000-a000-00000000f161'),
1::bigint, 'P4 owning firm can read authenticated approval on its case');
select lives_ok(
$$ update compliance_cases set stage='delivered',closed_at=now()
where id='00000000-0000-4000-a000-00000000f161' $$,
'P4 owner firm can deliver after signed client consent');

select * from finish();
rollback;
