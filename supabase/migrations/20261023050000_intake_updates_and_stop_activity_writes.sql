-- Intake moves use the capability that already opens a client file.
-- No new permission is added.
drop policy if exists "firm updates registrations" on registrations;
create policy "firm updates registrations" on registrations
  for update
  using (member_has('engagement.create'))
  with check (member_has('engagement.create'));

-- The live record is case_events. Stop new writes to the legacy log.
drop policy if exists "firm legacy activity insert" on activity_events;
drop policy if exists "firm legacy activity update" on activity_events;
revoke insert, update, delete on table activity_events from anon, authenticated;
