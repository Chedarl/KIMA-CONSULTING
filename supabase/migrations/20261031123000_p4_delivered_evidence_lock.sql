-- Phase 4: a delivered case's filing evidence is immutable.
-- case_stage_guard only checks the client signature at the moment of delivery;
-- a same-stage UPDATE afterwards could swap filing_evidence_ref (or the
-- reference/timestamps) for something the client never approved. Delivery is
-- terminal (the stage guard allows no outgoing transitions), so locking the
-- five filing fields on updates to delivered rows closes the swap without
-- blocking bookkeeping such as owner, blocker or billing_status.
-- Additive and reversible: drop trigger + drop function to undo.
create function private.delivered_evidence_lock()
returns trigger language plpgsql
set search_path to ''
as $$
begin
  if new.filing_status is distinct from old.filing_status
     or new.filing_reference is distinct from old.filing_reference
     or new.filing_evidence_ref is distinct from old.filing_evidence_ref
     or new.filing_attempted_at is distinct from old.filing_attempted_at
     or new.filing_verified_at is distinct from old.filing_verified_at then
    raise exception 'filing evidence on a delivered case is immutable'
      using errcode = '23514';
  end if;
  return new;
end $$;

comment on function private.delivered_evidence_lock() is
  'Phase 4: the filing fields a client signed are read-only once the case is delivered.';

drop trigger if exists delivered_evidence_lock on public.compliance_cases;
create trigger delivered_evidence_lock
  before update on public.compliance_cases
  for each row when (old.stage = 'delivered')
  execute function private.delivered_evidence_lock();
