-- Automate two things a screen must never be trusted to do:
--   1. an incident's timeline is written by the database, not by the caller;
--   2. a document version number is allocated, not guessed.

create or replace function private.incident_timeline_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor text;
begin
  actor := case new.reported_by when 'firm' then 'reviewer' else 'taxpayer' end;

  if tg_op = 'INSERT' then
    insert into public.incident_events (incident_id, kind, actor_role, actor_label, basis, to_value)
    values (new.id, 'incident_reported', actor,
            case actor when 'reviewer' then 'Firm' else 'Taxpayer' end,
            'declared', new.type);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.incident_events (incident_id, kind, actor_role, actor_label, basis, from_value, to_value)
    values (new.id, 'incident_status_changed', actor,
            case actor when 'reviewer' then 'Firm' else 'Taxpayer' end,
            'recorded', old.status, new.status);
  end if;

  if new.payment_state is distinct from old.payment_state then
    insert into public.incident_events (incident_id, kind, actor_role, actor_label, basis, from_value, to_value)
    values (new.id, 'payment_changed', 'reviewer',
            coalesce(new.verified_by, 'Firm'),
            case when new.payment_state = 'verified' then 'verified' else 'recorded' end,
            old.payment_state, new.payment_state);
  end if;

  return new;
end;
$$;

create trigger payment_incidents_timeline
  after insert or update on public.payment_incidents
  for each row execute function private.incident_timeline_guard();

-- Version numbers are allocated under the row lock, so two simultaneous uploads
-- produce 3 and 4 rather than two 3s.
create or replace function private.document_version_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.version_no is null then
    select coalesce(max(version_no), 0) + 1
      into new.version_no
      from public.document_versions
     where document_id = new.document_id;
  end if;
  return new;
end;
$$;

alter table public.document_versions
  alter column version_no drop not null;

create trigger document_versions_number
  before insert on public.document_versions
  for each row execute function private.document_version_number();

comment on function private.document_version_number() is
  'Allocates the next version number per document. Callers pass null and never choose a number.';
