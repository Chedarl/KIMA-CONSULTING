-- The client identity bridge resolved a signed-in client's organisation only
-- for engagements whose status was 'active' or 'authorized'. 'active' is not a
-- valid engagement status -- the CHECK constraint is
-- ('draft','invited','accepted','authorized','revoked','expired') -- so 'active'
-- never matched and the bridge effectively resolved only 'authorized'.
--
-- Consequence: a client whose engagement was 'accepted' (the client accepted,
-- the firm has not yet authorised the engagement) resolved to no organisation,
-- so their documents and dashboard fell silent; and a taxpayer engaged by more
-- than one firm was collapsed to whichever engagement carried the latest
-- authorized_at. Both are tenant-identity defects, not security leaks (the
-- engagement row itself stays RLS-scoped).
--
-- This aligns the bridge with the house pattern used by every other
-- access-control surface, which treats an engagement as live for
-- ('accepted','authorized') while revoked_at is null.
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
       where e2.taxpayer_id = ids.tp_id and e2.status in ('accepted','authorized') and e2.revoked_at is null
       order by e2.authorized_at desc nulls last
       limit 1
    ) e on true
   order by tp.id;
$$;

revoke all on function public.client_taxpayer_ids() from public, anon;
grant execute on function public.client_taxpayer_ids() to authenticated;
