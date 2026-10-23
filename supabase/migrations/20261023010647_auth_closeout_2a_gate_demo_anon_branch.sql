-- Part 2a. The demo anon branch now needs app.allow_demo_anon = 'on', which is
-- off by default. Until a session exists, anon sees nothing -- which is the
-- point: the branch existed so the demo could work without Auth, and it must
-- never be the thing standing between real taxpayer data and the public
-- internet (R-32).

create or replace function can_see_taxpayer(tp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    member_has('case.view')
    or tp in (select client_taxpayer_ids())
    or (
      current_setting('app.allow_demo_anon', true) = 'on'
      and auth.uid() is null
      and tp = demo_taxpayer_id()
    )
$$;

comment on function can_see_taxpayer(uuid) is
  'Tenant scoping. Demo anon branch requires app.allow_demo_anon=on and must stay off for real data (R-32).';

do $$
declare
  t text;
  p record;
  write_tables text[] := array[
    'account_tags','accounting_periods','activity_events','compliance_cases',
    'contact_account_links','declarations','document_requests','document_verdicts',
    'documents','engagements','messages','portal_accounts'
  ];
begin
  foreach t in array write_tables loop
    for p in select polname from pg_policy
             where polrelid = format('public.%I', t)::regclass
               and polname in ('firm writes', 'firm updates') loop
      execute format('drop policy %I on public.%I', p.polname, t);
    end loop;
  end loop;
end $$;
