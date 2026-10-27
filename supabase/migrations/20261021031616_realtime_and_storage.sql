-- Realtime: the firm sees a client's upload appear without refreshing, and the
-- client sees the firm's decision the moment it is made. This two-sided live
-- sync is the product's differentiator, so it is wired at the database level.
alter publication supabase_realtime add table document_requests;
alter publication supabase_realtime add table documents;
alter publication supabase_realtime add table declarations;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table activity_events;

-- Private bucket for demo uploads. Not public: files are reached through the
-- application, never by guessing a URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kima-demo', 'kima-demo', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv','text/plain']
)
on conflict (id) do nothing;

create policy demo_upload on storage.objects for insert to anon
  with check (bucket_id = 'kima-demo');
create policy demo_read_objects on storage.objects for select to anon
  using (bucket_id = 'kima-demo');
