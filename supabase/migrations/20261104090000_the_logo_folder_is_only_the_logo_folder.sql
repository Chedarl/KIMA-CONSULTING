-- The firm-logo policies from 20261103190000 checked only the SECOND path
-- segment:
--
--   split_part(name, '/', 2) = current_firm_member().id
--
-- Nothing anchored the FIRST segment, and RLS policies for one command are
-- OR'ed together, so this became an extra way to write anywhere in the shared
-- `kima-demo` bucket. `kima_objects_write` scopes an object by its first
-- segment (`storage_path_taxpayer(name)`, the taxpayer's id); the logo policy
-- let a caller put anything it liked in that position as long as the second
-- segment was its own member id.
--
-- Demonstrated against a clean replay, as a firm member holding no engagement
-- on the victim taxpayer:
--
--   insert kima-demo/{victim_taxpayer_id}/{attacker_member_id}/planted.pdf
--     -> accepted
--   the victim's own firm then lists:  internal.pdf, planted.pdf
--
-- The planted object sits in the victim taxpayer's folder and reads, to the
-- firm that does hold the engagement, as one of its own client's files. Tenant
-- isolation is a correctness requirement and evidence must be traceable to
-- where it came from, so this is a defect in both.
--
-- The read side was never breached -- the second segment still had to be the
-- caller's own member id, so no existing file became readable -- and a client
-- could not use it at all, holding no firm_members row. The hole was write-only
-- and firm-member-only, which is why nothing in production shows a trace of it
-- (0 objects in the bucket at the time of this migration).
--
-- The fix anchors the first segment. A logo lives at branding/{member}/... and
-- the policies now say so, which is what the original comment already claimed:
-- "A firm member uploads the firm logo into its own folder branding/{member}/."
--
-- UPDATE also gains an explicit WITH CHECK. Postgres reuses USING as the check
-- when WITH CHECK is absent, so the old policy was not itself a second hole,
-- but naming both halves keeps the rename case obvious to the next reader: the
-- row you may touch and the name you may give it are the same shape.

drop policy if exists "firm uploads its logo" on storage.objects;
drop policy if exists "firm updates its logo" on storage.objects;
drop policy if exists "firm reads its logo"   on storage.objects;

create policy "firm uploads its logo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kima-demo'
    and split_part(name, '/', 1) = 'branding'
    and split_part(name, '/', 2) = (select id::text from public.current_firm_member())
  );

create policy "firm updates its logo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kima-demo'
    and split_part(name, '/', 1) = 'branding'
    and split_part(name, '/', 2) = (select id::text from public.current_firm_member())
  )
  with check (
    bucket_id = 'kima-demo'
    and split_part(name, '/', 1) = 'branding'
    and split_part(name, '/', 2) = (select id::text from public.current_firm_member())
  );

create policy "firm reads its logo" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kima-demo'
    and split_part(name, '/', 1) = 'branding'
    and split_part(name, '/', 2) = (select id::text from public.current_firm_member())
  );

-- A firm replacing its logo needs the old object gone; there was no DELETE
-- policy at all, so the previous file was unremovable. Same anchored shape.
drop policy if exists "firm deletes its logo" on storage.objects;
create policy "firm deletes its logo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kima-demo'
    and split_part(name, '/', 1) = 'branding'
    and split_part(name, '/', 2) = (select id::text from public.current_firm_member())
  );
