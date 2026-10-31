#!/usr/bin/env bash
# Run only against local Supabase; two independent sessions on one taxpayer.
set -euo pipefail
db="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
tmp="$(mktemp -d)"
cleanup() {
  psql "$db" -X -qAt -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || true
delete from public.engagements where id in
 ('00000000-0000-4000-c000-00000000d1a3','00000000-0000-4000-c000-00000000d1b3');
delete from public.firm_members where id in
 ('00000000-0000-4000-c000-00000000d1a2','00000000-0000-4000-c000-00000000d1b2');
delete from public.taxpayers where id='00000000-0000-4000-c000-00000000d1ff';
delete from public.organizations where id in
 ('00000000-0000-4000-c000-00000000d1a0','00000000-0000-4000-c000-00000000d1b0');
delete from auth.users where id in
 ('00000000-0000-4000-c000-00000000d1a1','00000000-0000-4000-c000-00000000d1b1');
SQL
  rm -rf "$tmp"
}
trap cleanup EXIT

psql "$db" -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id,email) values
 ('00000000-0000-4000-c000-00000000d1a1','race-a-two-session@example.test'),
 ('00000000-0000-4000-c000-00000000d1b1','race-b-two-session@example.test');
insert into public.organizations (id,name) values
 ('00000000-0000-4000-c000-00000000d1a0','Race Two Session A'),
 ('00000000-0000-4000-c000-00000000d1b0','Race Two Session B');
insert into public.taxpayers (id,legal_name) values
 ('00000000-0000-4000-c000-00000000d1ff','Concurrent Prospect');
insert into public.firm_members
 (id,organization_id,person_label,email,role,auth_user_id) values
 ('00000000-0000-4000-c000-00000000d1a2',
  '00000000-0000-4000-c000-00000000d1a0','Partner A',
  'race-a-two-session@example.test','firm_partner',
  '00000000-0000-4000-c000-00000000d1a1'),
 ('00000000-0000-4000-c000-00000000d1b2',
  '00000000-0000-4000-c000-00000000d1b0','Partner B',
  'race-b-two-session@example.test','firm_partner',
  '00000000-0000-4000-c000-00000000d1b1');
insert into public.engagements
 (id,organization_id,taxpayer_id,status) values
 ('00000000-0000-4000-c000-00000000d1a3',
  '00000000-0000-4000-c000-00000000d1a0',
  '00000000-0000-4000-c000-00000000d1ff','draft'),
 ('00000000-0000-4000-c000-00000000d1b3',
  '00000000-0000-4000-c000-00000000d1b0',
  '00000000-0000-4000-c000-00000000d1ff','draft');
SQL

psql "$db" -X -qAt -v ON_ERROR_STOP=1 >"$tmp/a.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-c000-00000000d1a1","role":"authenticated"}',true);
update public.engagements set status='authorized', authorized_at=now()
 where id='00000000-0000-4000-c000-00000000d1a3';
\echo FIRST_GRANT_WRITTEN
select pg_sleep(5);
commit;
SQL
a_pid=$!
ready=0
for _ in $(seq 1 100); do
  if grep -q FIRST_GRANT_WRITTEN "$tmp/a.log"; then ready=1; break; fi
  if ! kill -0 "$a_pid" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$ready" != 1 ]]; then
  cat "$tmp/a.log" >&2
  echo "First session failed to establish an uncommitted grant" >&2
  wait "$a_pid" || true
  exit 1
fi

psql "$db" -X -qAt -v ON_ERROR_STOP=1 >"$tmp/b.log" 2>&1 <<'SQL' &
\set VERBOSITY verbose
begin;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-c000-00000000d1b1","role":"authenticated"}',true);
update public.engagements set status='authorized', authorized_at=now()
 where id='00000000-0000-4000-c000-00000000d1b3';
commit;
SQL
b_pid=$!
sleep 1
if ! kill -0 "$b_pid" 2>/dev/null; then
  echo "Second firm did not wait for first transaction" >&2
  cat "$tmp/b.log" >&2
  wait "$a_pid" || true
  wait "$b_pid" || true
  exit 1
fi
wait "$a_pid"
b_status=0
wait "$b_pid" || b_status=$?
if [[ "$b_status" -eq 0 ]] || ! grep -q '42501' "$tmp/b.log"; then
  echo "Second firm must fail with 42501 after first firm commits" >&2
  cat "$tmp/b.log" >&2
  exit 1
fi
grants="$(psql "$db" -X -qAt -v ON_ERROR_STOP=1 -c \
 "select count(*) from public.engagements where taxpayer_id='00000000-0000-4000-c000-00000000d1ff' and authorized_at is not null")"
[[ "$grants" == 1 ]] || { echo "Expected one authorized firm; got $grants" >&2; exit 1; }
echo "R-56 two-session race: second firm waited and was refused (42501)."
