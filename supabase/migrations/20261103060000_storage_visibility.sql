-- Storage must respect document visibility.
--
-- documents.visibility hides an internal file from the client in the table, but
-- the object bytes in storage were still readable to anyone who could see the
-- taxpayer: the policy only checked storage_path_taxpayer(name). A firm's
-- working papers therefore remained downloadable by the client they were hidden
-- from. This closes that.

drop policy "kima_objects_read" on storage.objects;
create policy "kima_objects_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kima-demo'
    and private.can_see_taxpayer(storage_path_taxpayer(name))
    and (
      private.member_has('case.view', storage_path_taxpayer(name))
      or exists (
        select 1 from public.documents d
         where d.storage_path = storage.objects.name
           and d.visibility = 'client'
      )
    )
  );
