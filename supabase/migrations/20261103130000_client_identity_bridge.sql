-- The client portal resolves a signed-in client's own taxpayer through
-- private.client_taxpayer_ids(), which PostgREST cannot call: it only serves
-- the public schema. This bridge exposes the same result with its engagement
-- organisation, so the client documents and dashboard screens can work for a
-- REAL signed-in client instead of only the demo session.
create or replace function public.client_taxpayer_ids()
returns table (taxpayer_id uuid, organization_id uuid)
language sql stable security definer set search_path to 'public'
as $$
  select tp.id, e.organization_id
    from private.client_taxpayer_ids() as ids(tp_id)
    join public.taxpayers tp on tp.id = ids.tp_id
    left join lateral (
      select e2.organization_id
        from public.engagements e2
       where e2.taxpayer_id = ids.tp_id and e2.status in ('active','authorized') and e2.revoked_at is null
       order by e2.authorized_at desc nulls last
       limit 1
    ) e on true
   order by tp.id;
$$;

revoke all on function public.client_taxpayer_ids() from public, anon;
grant execute on function public.client_taxpayer_ids() to authenticated;
