-- Task assignment (wireframe 03).
--
-- case_tasks.assigned_to is free text copied from the case owner, so a task
-- cannot be filtered by person, cannot be reassigned safely, and a display
-- name is all the database holds. This adds a real member reference while
-- keeping the label for the surfaces that print it.

alter table public.case_tasks
  add column assignee_member_id uuid references public.firm_members(id) on delete set null;

create index case_tasks_assignee_idx on public.case_tasks (assignee_member_id, state);

-- A member may be assigned only if they belong to the firm that owns the case.
create or replace function private.case_task_assignee_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org uuid;
  member_org uuid;
begin
  if new.assignee_member_id is null then
    return new;
  end if;

  select organization_id into org from public.compliance_cases where id = new.case_id;
  select organization_id into member_org from public.firm_members where id = new.assignee_member_id;

  if org is null or member_org is null or org <> member_org then
    raise exception 'a task can only be assigned to a member of the firm that owns the case';
  end if;

  return new;
end;
$$;

create trigger case_tasks_assignee_guard
  before insert or update of assignee_member_id on public.case_tasks
  for each row execute function private.case_task_assignee_guard();
