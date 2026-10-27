-- Part 3. case_events gains a taxpayer scope and a nullable case, so the
-- second, unstructured activity log can be folded into it; and the two tables
-- that still accepted writes from anybody now name a capability.

alter table case_events alter column case_id drop not null;
alter table case_events add column if not exists taxpayer_id uuid references taxpayers (id);

update case_events e
set taxpayer_id = c.taxpayer_id
from compliance_cases c
where e.case_id = c.id and e.taxpayer_id is null;

alter table case_events
  drop constraint if exists case_events_case_or_taxpayer;
alter table case_events
  add constraint case_events_case_or_taxpayer check (case_id is not null or taxpayer_id is not null);

drop policy if exists "scoped read" on case_events;
drop policy if exists "scoped write" on case_events;

create policy "scoped read" on case_events for select using (
  (
    (case_id is not null and exists (
      select 1 from compliance_cases c
      where c.id = case_events.case_id and can_see_taxpayer(c.taxpayer_id)
    ))
    or (taxpayer_id is not null and can_see_taxpayer(taxpayer_id))
  )
  and (visibility = 'client' or member_has('event.view_internal'))
);

create policy "scoped write" on case_events for insert with check (
  (
    (case_id is not null and exists (
      select 1 from compliance_cases c
      where c.id = case_events.case_id and can_see_taxpayer(c.taxpayer_id)
    ))
    or (taxpayer_id is not null and can_see_taxpayer(taxpayer_id))
  )
  and (
    member_has('case.advance')
    or member_has('document.review')
    or member_has('note.write_client')
    or member_has('filing.record')
    or (taxpayer_id is not null and taxpayer_id in (select client_taxpayer_ids()))
    or (
      case_id is not null and exists (
        select 1 from compliance_cases c
        where c.id = case_events.case_id
          and c.taxpayer_id in (select client_taxpayer_ids())
      )
    )
  )
);

drop policy if exists "anyone may append audit" on audit_events;
create policy "firm appends audit" on audit_events for insert
  with check (member_has('event.view_internal') or member_has('case.advance'));

drop policy if exists "anyone may answer" on organizer_answers;
create policy "firm or client answers organizer" on organizer_answers for insert
  with check (
    member_has('case.advance')
    or can_see_taxpayer(taxpayer_id)
  );

drop policy if exists "firm writes" on activity_events;
drop policy if exists "firm updates" on activity_events;
create policy "firm legacy activity insert" on activity_events for insert
  with check (member_has('note.write_client'));
create policy "firm legacy activity update" on activity_events for update
  using (member_has('note.write_client'))
  with check (member_has('note.write_client'));
