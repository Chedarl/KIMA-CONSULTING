-- A firm's name is public. Its record is not. (R-55)
--
-- `organizations` carried one policy, `demo_read_orgs`, `for select using
-- (true)` with no role named, so an anonymous visitor read every firm's whole
-- row: id, name, kind, country and the date it signed up. Harmless while
-- production holds one organisation; a customer list the moment phase 2 admits
-- a second.
--
-- THE OWNER'S DECISION, 30 Oct: names stay public, because an applicant has to
-- be able to choose a firm. So this is a narrowing, not a lock-down. The open
-- rule goes; a firm's name is reachable through one lookup that returns nothing
-- else; and the record itself becomes readable only inside the firm.
--
-- WHY A FUNCTION AND NOT COLUMN GRANTS. `firm_members` solves the same shape of
-- problem with column-level SELECT (`20261022163452`), and it looked like the
-- cheaper answer here. It cannot express this one: column grants are table-wide
-- and policy-blind, so narrowing to (id, name) for a visitor would narrow it for
-- the firm's own members too, and the owner asked for the opposite — everything
-- else readable inside the firm. Postgres has no per-policy column grant, so the
-- public half has to leave the table behind.
--
-- WHY THIS IS THE SECOND SECURITY DEFINER FUNCTION IN `public`, DELIBERATELY.
-- T-53 holds that exactly one definer function in the published schema may be
-- executed by anon or authenticated, and names it. That invariant exists to stop
-- definer surface appearing unnoticed, not to cap it at one: a second has to be
-- added to the test by hand, with its justification, which is this paragraph and
-- the census change in supabase/tests/definer_surface_test.sql. It is as narrow
-- as the first: no arguments, no writes, two columns out, and nothing a caller
-- can steer.

drop policy if exists demo_read_orgs on public.organizations;

-- 1. The firm's own record, whole, to its own members. `current_member_org()`
--    resolves through firm_members on auth.uid(), so a caller who is not a
--    member of any firm matches no row -- including a signed-in client.
create policy "a firm reads itself" on public.organizations for select to authenticated
  using (id = private.current_member_org());

-- 2. The client's side of the same question. A taxpayer's portal needs the id of
--    the firm that holds them -- it is written on every message they send -- and
--    they already know who their accountant is, so this discloses nothing. Live
--    engagements only: a revoked one is history, not a relationship.
--
--    The subquery on engagements runs under the caller's own RLS, which is
--    deliberate: `"scoped read"` already answers this through
--    can_see_taxpayer(), so no new helper is needed and the two cannot drift.
create policy "a client reads the firm engaged with them" on public.organizations
  for select to authenticated
  using (
    id in (
      select e.organization_id
        from engagements e
       where e.taxpayer_id in (select private.client_taxpayer_ids())
         and e.status in ('authorized', 'accepted')
         and e.revoked_at is null
    )
  );

-- `anon` is left with no policy at all rather than a predicate that evaluates to
-- false, so an anonymous read of the table is refused by there being no rule for
-- it. Same shape as R-53's fix on firm_members.

-- 3. The narrow public lookup. Two columns, every firm, no arguments: a visitor
--    choosing a firm sees the list of names and nothing about any of them. The
--    id goes out with the name because choosing a firm means naming one, and it
--    unlocks nothing on its own -- the policies above still refuse the row.
--
--    The verification label joins this when R-57's migration adds the column;
--    there is no column to expose today, and inventing one here would put a
--    label in the interface that nothing sets.
create or replace function public.firm_directory()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id, o.name from organizations o order by o.name
$$;

comment on function public.firm_directory() is
  'Every firm''s id and name, and nothing else, to anyone -- the one public '
  'route to a firm''s name now that the whole record is readable only inside '
  'the firm. SECURITY DEFINER because the table''s policies deliberately refuse '
  'anon; narrow by construction: no arguments, no writes, two columns. The '
  'second definer function admitted to the published schema, justified in the '
  'migration and named in T-53. R-55.';

revoke execute on function public.firm_directory() from public;
grant execute on function public.firm_directory() to anon, authenticated;
