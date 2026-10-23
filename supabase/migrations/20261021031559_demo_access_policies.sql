-- DEMO ACCESS POLICIES — synthetic data only.
--
-- This deployment has no authentication yet, so access is granted to the anon
-- role and scoped to the single seeded demo taxpayer. That is acceptable only
-- because every row in this database is fabricated. It is NOT the production
-- model: production requires authenticated users, membership-based tenant
-- scoping, and the engagement check described in docs/foundation/permissions-matrix.md.
--
-- Real taxpayer data must never be written here (risk R-32).

create or replace function demo_taxpayer_id() returns uuid
language sql stable as $$
  select id from taxpayers where legal_name = 'Mboa Traders SARL' limit 1;
$$;

-- Reference tables: read-only.
create policy demo_read_orgs on organizations for select to anon using (true);
create policy demo_read_taxpayers on taxpayers for select to anon using (id = demo_taxpayer_id());
create policy demo_read_engagements on engagements for select to anon using (taxpayer_id = demo_taxpayer_id());
create policy demo_read_periods on accounting_periods for select to anon using (taxpayer_id = demo_taxpayer_id());

-- Working tables: read and write, demo taxpayer only.
create policy demo_rw_requests_select on document_requests for select to anon using (taxpayer_id = demo_taxpayer_id());
create policy demo_rw_requests_update on document_requests for update to anon
  using (taxpayer_id = demo_taxpayer_id()) with check (taxpayer_id = demo_taxpayer_id());
create policy demo_rw_requests_insert on document_requests for insert to anon
  with check (taxpayer_id = demo_taxpayer_id());

create policy demo_rw_documents_select on documents for select to anon using (taxpayer_id = demo_taxpayer_id());
create policy demo_rw_documents_insert on documents for insert to anon with check (taxpayer_id = demo_taxpayer_id());
create policy demo_rw_documents_update on documents for update to anon
  using (taxpayer_id = demo_taxpayer_id()) with check (taxpayer_id = demo_taxpayer_id());

create policy demo_rw_decls_select on declarations for select to anon using (taxpayer_id = demo_taxpayer_id());
create policy demo_rw_decls_update on declarations for update to anon
  using (taxpayer_id = demo_taxpayer_id()) with check (taxpayer_id = demo_taxpayer_id());

create policy demo_rw_messages_select on messages for select to anon using (taxpayer_id = demo_taxpayer_id());
create policy demo_rw_messages_insert on messages for insert to anon with check (taxpayer_id = demo_taxpayer_id());
create policy demo_rw_messages_update on messages for update to anon
  using (taxpayer_id = demo_taxpayer_id()) with check (taxpayer_id = demo_taxpayer_id());

create policy demo_rw_activity_select on activity_events for select to anon using (taxpayer_id = demo_taxpayer_id());
create policy demo_rw_activity_insert on activity_events for insert to anon with check (taxpayer_id = demo_taxpayer_id());

-- Audit is append-only for everyone. No update or delete policy exists, so
-- neither is possible through this key, by construction.
create policy demo_audit_select on audit_events for select to anon using (true);
create policy demo_audit_insert on audit_events for insert to anon with check (true);
