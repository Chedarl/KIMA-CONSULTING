-- The signed-in firm member, answered by the database.
--
-- The client cannot read firm_members.auth_user_id (the column is deliberately
-- withheld from authenticated callers) and Postgres requires the privilege for a
-- column used in a WHERE, so a browser cannot resolve "which member am I?" from
-- the table. Without this, a valid Supabase session -- a magic link, a refreshed
-- tab, a second device -- left the workspace bar claiming nobody was signed in
-- while the dashboard rendered that member's clients (issue #241).
--
-- It returns the caller's own row only: no arguments, no writes, three columns,
-- nothing a caller can steer.

create or replace function public.current_firm_member()
returns table (id uuid, person_label text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.person_label, m.role::text
    from public.firm_members m
   where m.auth_user_id = auth.uid()
     and m.active
     and m.organization_id is not null
   limit 1;
$$;

comment on function public.current_firm_member() is
  'The calling firm member, resolved from auth.uid(). Own row only; used to adopt an existing Supabase session as a firm session.';

revoke all on function public.current_firm_member() from public, anon;
grant execute on function public.current_firm_member() to authenticated;
