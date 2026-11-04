-- The firm advanced a case in two PostgREST calls: update compliance_cases,
-- then insert case_events. A failure between them left the case advanced with
-- no audit event -- exactly the drift lib/events.ts drift() exists to catch.
-- This RPC applies the engine's patch and appends its events in ONE transaction,
-- and re-asserts the caller's authority at the database boundary.
--
-- Only the advance() patch columns are honoured; an unknown key is ignored,
-- never guessed. `blocker` is key-presence-aware so an explicit null clears it.
create or replace function public.advance_case(p_case_id uuid, p_patch jsonb, p_events jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
    from public.compliance_cases
   where id = p_case_id;

  if v_org is null or not private.member_has_in_org('case.advance', v_org) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  update public.compliance_cases
  set
    stage         = coalesce((p_patch->>'stage')::public.case_stage, stage),
    owner         = coalesce(nullif(p_patch->>'owner', ''), owner),
    blocker       = case when p_patch ? 'blocker' then nullif(p_patch->>'blocker', '') else blocker end,
    self_approved = coalesce((p_patch->>'self_approved')::boolean, self_approved),
    prepared_by   = coalesce(nullif(p_patch->>'prepared_by', ''), prepared_by),
    prepared_at   = coalesce((p_patch->>'prepared_at')::timestamptz, prepared_at),
    approved_by   = coalesce(nullif(p_patch->>'approved_by', ''), approved_by),
    approved_at   = coalesce((p_patch->>'approved_at')::timestamptz, approved_at),
    closed_at     = coalesce((p_patch->>'closed_at')::timestamptz, closed_at)
  where id = p_case_id;

  insert into public.case_events (
    organization_id, case_id, occurred_at, dimension, kind,
    actor_role, actor_label, from_value, to_value, subject_ref, reason, visibility
  )
  select
    v_org, p_case_id,
    coalesce((e->>'occurred_at')::timestamptz, now()),
    (e->>'dimension')::public.case_event_dimension,
    e->>'kind',
    (e->>'actor_role')::public.actor_role,
    e->>'actor_label',
    e->>'from_value', e->>'to_value', e->>'subject_ref', e->>'reason',
    (e->>'visibility')::public.event_visibility
  from jsonb_array_elements(p_events) e;
end;
$$;

revoke all on function public.advance_case(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.advance_case(uuid, jsonb, jsonb) to authenticated;
