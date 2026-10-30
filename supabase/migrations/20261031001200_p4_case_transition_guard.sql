-- Phase 4: database stage-transition gate. Independent of any UI flag.
-- A completed or cancelled case cannot be silently reopened or delivered
-- without filing verification and a client-signed consent row.

alter table public.compliance_cases
  drop constraint if exists closed_has_a_date;
alter table public.compliance_cases
  add constraint closed_has_a_date check (
    (stage in ('delivered','abandoned','cancelled')) = (closed_at is not null)
  );

create or replace function private.case_stage_guard()
returns trigger
language plpgsql
set search_path to 'private', 'public'
as $$
declare
  allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.stage <> 'documents' then
      raise exception 'new cases must start in documents' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage then
    -- Reject illegal delivery before checking actor authority. This keeps the
    -- database's universal outcome guard effective for all writing roles.
    if new.stage = 'delivered' and old.stage <> 'client_approval' then
      raise exception 'illegal case stage transition' using errcode='23514';
    end if;
    -- Firm may advance only a taxpayer under an active, scoped engagement.
    -- Service-role writes are reserved for migrations, not ordinary users.
    if not (auth.uid() is null and current_user in
        ('postgres','service_role','supabase_admin'))
       and not coalesce(private.member_has('case.advance', old.taxpayer_id), false) then
      raise exception 'case advancement requires current firm authority'
        using errcode = '42501';
    end if;

    allowed := case old.stage
      when 'documents' then new.stage in ('accounting','abandoned','cancelled')
      when 'accounting' then new.stage in ('preparation','documents','abandoned','cancelled')
      when 'preparation' then new.stage in ('review','accounting','documents','abandoned','cancelled')
      when 'review' then new.stage in ('filing','preparation','abandoned','cancelled')
      when 'filing' then new.stage in ('evidence','review','abandoned','cancelled')
      when 'evidence' then new.stage in ('client_approval','filing','abandoned','cancelled')
      when 'client_approval' then new.stage in ('delivered','evidence','cancelled')
      else false
    end;
    if not allowed then
      raise exception 'illegal case stage transition' using errcode = '23514';
    end if;

    if new.stage = 'client_approval' then
      -- Each return/re-review creates a fresh consent requirement.
      new.approval_round := old.approval_round + 1;
    end if;

    if new.stage = 'client_approval' and (
      new.filing_status <> 'verified'
      or nullif(btrim(new.filing_evidence_ref), '') is null
      or new.filing_verified_at is null
    ) then
      raise exception 'verified filing evidence required before client approval'
        using errcode = '23514';
    end if;

    if new.stage = 'delivered' and not exists (
      select 1 from public.case_client_approvals a
       where a.case_id = old.id and a.taxpayer_id = old.taxpayer_id
         and a.approval_round = old.approval_round
         and a.filing_evidence_ref = new.filing_evidence_ref
    ) then
      raise exception 'authenticated client consent required before delivery'
        using errcode = '23514';
    end if;
  end if;

  -- A caller cannot create or rewind approval rounds through direct UPDATE.
  if not (new.stage = 'client_approval' and old.stage <> 'client_approval') then
    new.approval_round := old.approval_round;
  end if;

  -- Enforce verified filing even on same-stage updates or direct SQL writes.
  if new.stage in ('client_approval','delivered') and (
    new.filing_status <> 'verified'
    or nullif(btrim(new.filing_evidence_ref), '') is null
    or new.filing_verified_at is null
  ) then
    raise exception 'filing verification must remain valid for approval/delivery'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists case_stage_guard on public.compliance_cases;
create trigger case_stage_guard
  before insert or update on public.compliance_cases
  for each row execute function private.case_stage_guard();
