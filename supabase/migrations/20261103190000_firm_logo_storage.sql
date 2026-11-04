-- ---------------------------------------------------------------------------
-- A firm member uploads the firm logo into its own folder branding/{member}/.
-- The branding row points at that path; BrandMark signs it for display.
-- ---------------------------------------------------------------------------
create policy "firm uploads its logo" on storage.objects for insert to authenticated
  with check (bucket_id = 'kima-demo' and split_part(name, '/', 2) = (select id::text from public.current_firm_member()));

create policy "firm updates its logo" on storage.objects for update to authenticated
  using (bucket_id = 'kima-demo' and split_part(name, '/', 2) = (select id::text from public.current_firm_member()));

create policy "firm reads its logo" on storage.objects for select to authenticated
  using (bucket_id = 'kima-demo' and split_part(name, '/', 2) = (select id::text from public.current_firm_member()));
