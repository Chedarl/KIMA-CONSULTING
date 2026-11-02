-- Document visibility (wireframe 02): a firm may hold a file the client does
-- not see, and the client's own upload can never be marked internal.
--
-- Reception is unchanged: an upload still arrives as review_status='pending'.
-- What this adds is the audience, enforced by the SELECT policy rather than by
-- a screen that might forget.

alter table public.documents
  add column visibility text not null default 'client'
  check (visibility in ('client', 'internal'));

drop policy "scoped read" on public.documents;
create policy "scoped read" on public.documents
  for select to public
  using (
    private.can_see_taxpayer(taxpayer_id)
    and (visibility = 'client' or private.member_has('case.view', taxpayer_id))
  );

drop policy "client uploads documents" on public.documents;
create policy "client uploads documents" on public.documents
  for insert to public
  with check (
    taxpayer_id in (select private.client_taxpayer_ids())
    and uploaded_by = 'taxpayer'
    and arrived_via = 'upload'
    and review_status = 'pending'
    and acceptance is null
    and visibility = 'client'
    and (storage_path is null or storage_path_taxpayer(storage_path) = taxpayer_id)
  );
