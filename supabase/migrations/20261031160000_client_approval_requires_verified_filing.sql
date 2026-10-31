-- Client consent is not a UI flag. The insert policy already asks for a
-- verified filing, but row-level security does not bind the table owner or
-- any role with bypassrls. A BEFORE trigger does.
--
-- Inserts must match the case's current round, filing_status = 'verified',
-- and the non-blank filing_evidence_ref the client is signing. Updates and
-- deletes are refused; once the case is delivered the error says so, because
-- that signature is what delivery was allowed to rely on.

create function private.case_client_approval_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1
        from public.compliance_cases c
       where c.id = new.case_id
         and c.taxpayer_id = new.taxpayer_id
         and c.stage = 'client_approval'
         and c.approval_round = new.approval_round
         and c.filing_status = 'verified'
         and c.filing_verified_at is not null
         and nullif(btrim(c.filing_evidence_ref), '') is not null
         and c.filing_evidence_ref = new.filing_evidence_ref
    ) then
      raise exception
        'client approval requires the current verified filing evidence for this round'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.compliance_cases c
     where c.id = old.case_id and c.stage = 'delivered'
  ) then
    raise exception 'a client approval is immutable after delivery'
      using errcode = '42501';
  end if;
  raise exception 'a client approval cannot be changed or removed'
    using errcode = '42501';
end $$;

revoke all on function private.case_client_approval_guard() from public, anon;
grant execute on function private.case_client_approval_guard() to authenticated;

comment on function private.case_client_approval_guard() is
  'Phase 4: consent rows must match the case''s verified filing evidence and '
  'round, for every writer. Append-only, and immutable after delivery. '
  'SECURITY DEFINER so the check sees the case even when the caller bypasses RLS.';

drop trigger if exists case_client_approval_guard on public.case_client_approvals;
create trigger case_client_approval_guard
  before insert or update or delete on public.case_client_approvals
  for each row execute function private.case_client_approval_guard();
