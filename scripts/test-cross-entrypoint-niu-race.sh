#!/usr/bin/env bash
# Only the disposable local Supabase DB. Never point this at production/staging.
set -euo pipefail
db="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
tmp="$(mktemp -d)"
cleanup() {
  psql "$db" -X -qAt -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || true
delete from public.audit_events where organization_id in
 ('00000000-0000-4000-d000-00000000e010','00000000-0000-4000-d000-00000000e011');
delete from public.case_events where organization_id in
 ('00000000-0000-4000-d000-00000000e010','00000000-0000-4000-d000-00000000e011');
delete from public.contact_account_links where taxpayer_id in
 (select id from public.taxpayers where niu in ('Z9RACE0000000001','Z9RACE0000000002'));
delete from public.portal_accounts where identifier in
 ('Z9RACE0000000001','Z9RACE0000000002');
delete from public.contacts where organization_id in
 ('00000000-0000-4000-d000-00000000e010','00000000-0000-4000-d000-00000000e011');
delete from public.engagements where taxpayer_id in
 (select id from public.taxpayers where niu in ('Z9RACE0000000001','Z9RACE0000000002'));
delete from public.registrations where id in
 ('00000000-0000-4000-d000-00000000e040','00000000-0000-4000-d000-00000000e041');
delete from public.taxpayers where niu in ('Z9RACE0000000001','Z9RACE0000000002');
delete from public.firm_members where id in
 ('00000000-0000-4000-d000-00000000e020','00000000-0000-4000-d000-00000000e021');
delete from public.organizations where id in
 ('00000000-0000-4000-d000-00000000e010','00000000-0000-4000-d000-00000000e011');
delete from auth.users where id in
 ('00000000-0000-4000-d000-00000000e001','00000000-0000-4000-d000-00000000e002');
SQL
  rm -rf "$tmp"
}
trap cleanup EXIT
psql "$db" -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id,email) values
 ('00000000-0000-4000-d000-00000000e001','race-direct@example.test'),
 ('00000000-0000-4000-d000-00000000e002','race-approve@example.test');
insert into public.organizations(id,name,kind) values
 ('00000000-0000-4000-d000-00000000e010','Direct Race Firm','firm'),
 ('00000000-0000-4000-d000-00000000e011','Approval Race Firm','firm');
insert into public.firm_members(id,organization_id,person_label,email,role,auth_user_id) values
 ('00000000-0000-4000-d000-00000000e020',
  '00000000-0000-4000-d000-00000000e010','Direct Partner',
  'race-direct@example.test','firm_partner','00000000-0000-4000-d000-00000000e001'),
 ('00000000-0000-4000-d000-00000000e021',
  '00000000-0000-4000-d000-00000000e011','Approval Partner',
  'race-approve@example.test','firm_partner','00000000-0000-4000-d000-00000000e002');
insert into public.registrations
 (id,organization_id,applicant_name,applicant_email,taxpayer_type,
  legal_name,declared_niu,preferred_language,onboarding) values
 ('00000000-0000-4000-d000-00000000e040',
  '00000000-0000-4000-d000-00000000e011','Race Applicant One',
  'race1@applicant.test','business','Race Applicant One SARL',
  'Z9RACE0000000001','fr','{}'::jsonb),
 ('00000000-0000-4000-d000-00000000e041',
  '00000000-0000-4000-d000-00000000e011','Race Applicant Two',
  'race2@applicant.test','business','Race Applicant Two SARL',
  'Z9RACE0000000002','en','{}'::jsonb);
SQL
cat > "$tmp/direct.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000e001","role":"authenticated"}',true);
select outcome from public.open_client_file('Direct Race Client',
 p_niu => 'Z9RACE0000000001',p_requests => '[]'::jsonb,p_note => 'Race case');
\echo LOCK_HELD
select pg_sleep(5);
commit;
SQL
cat > "$tmp/approve.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000e002","role":"authenticated"}',true);
select outcome from public.approve_registration('00000000-0000-4000-d000-00000000e040');
commit;
SQL
cat > "$tmp/approve_first.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000e002","role":"authenticated"}',true);
select outcome from public.approve_registration('00000000-0000-4000-d000-00000000e041');
\echo LOCK_HELD
select pg_sleep(5);
commit;
SQL
cat > "$tmp/direct_second.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-d000-00000000e001","role":"authenticated"}',true);
select outcome from public.open_client_file('Direct Race Client Two',
 p_niu => 'Z9RACE0000000002',p_requests => '[]'::jsonb,p_note => 'Race case');
commit;
SQL
for variant in direct approve_first; do
  if [ "$variant" = direct ]; then first=direct; second=approve; want_first=opened
  else first=approve_first; second=direct_second; want_first=approved; fi
  psql "$db" -X -qAt -v ON_ERROR_STOP=1 -f "$tmp/$first.sql" > "$tmp/$first.log" 2>&1 &
  first_pid=$!
  ready=0
  for _ in $(seq 1 100); do
    if grep -q LOCK_HELD "$tmp/$first.log"; then ready=1; break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
    sleep 0.1
  done
  if [ "$ready" -ne 1 ]; then
    cat "$tmp/$first.log" >&2; wait "$first_pid" || true; exit 1
  fi
  psql "$db" -X -qAt -v ON_ERROR_STOP=1 -f "$tmp/$second.sql" > "$tmp/$second.log" 2>&1 &
  second_pid=$!
  sleep 1
  if ! kill -0 "$second_pid" 2>/dev/null; then
    echo "Second session did not wait for the NIU advisory lock" >&2
    cat "$tmp/$second.log" >&2
    wait "$first_pid" || true; wait "$second_pid" || true; exit 1
  fi
  wait "$first_pid"
  wait "$second_pid"
  grep -qx "$want_first" "$tmp/$first.log" || {
    cat "$tmp/$first.log" >&2; echo "Wrong first outcome" >&2; exit 1;
  }
  grep -qx 'already_registered' "$tmp/$second.log" || {
    cat "$tmp/$second.log" >&2; echo "Expected already_registered" >&2; exit 1;
  }
done
state="$(psql "$db" -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
select (select count(*) from public.taxpayers
         where upper(btrim(niu))='Z9RACE0000000001') || ':' ||
       (select count(*) from public.taxpayers
         where upper(btrim(niu))='Z9RACE0000000002') || ':' ||
       (select count(*) from public.portal_accounts
         where identifier='Z9RACE0000000002');
SQL
)"
[ "$state" = '1:1:1' ] || {
  echo "Expected one taxpayer per NIU and one pending portal account; got $state" >&2
  exit 1
}
echo "Two sessions, both orderings: waited, one taxpayer per NIU, already_registered."
