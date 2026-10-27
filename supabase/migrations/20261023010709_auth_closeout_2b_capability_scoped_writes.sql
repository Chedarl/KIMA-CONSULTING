-- Part 2b. Seeing is not mutating: every write now names the capability it
-- needs, from the same matrix lib/permissions.ts holds.

create policy "client uploads documents" on documents for insert
  with check (taxpayer_id in (select client_taxpayer_ids()));
create policy "firm inserts documents" on documents for insert
  with check (member_has('document.review') or member_has('request.create'));
create policy "firm reviews documents" on documents for update
  using (member_has('document.review'))
  with check (member_has('document.review'));

-- A client may send a document. A client may NOT accept one: `accepted` is
-- absent from this list on purpose, and that is the whole interaction rule
-- expressed in SQL rather than in a component.
create policy "client submits requests" on document_requests for update
  using (taxpayer_id in (select client_taxpayer_ids()))
  with check (
    taxpayer_id in (select client_taxpayer_ids())
    and status in ('submitted', 'requested', 'returned', 'in_progress', 'in_client_review')
  );
create policy "firm creates requests" on document_requests for insert
  with check (member_has('request.create'));
create policy "firm updates requests" on document_requests for update
  using (member_has('request.create') or member_has('request.return') or member_has('document.review'))
  with check (member_has('request.create') or member_has('request.return') or member_has('document.review'));

create policy "firm advances cases" on compliance_cases for insert
  with check (member_has('case.advance'));
create policy "firm updates cases" on compliance_cases for update
  using (member_has('case.advance') or member_has('filing.record') or member_has('filing.verify'))
  with check (member_has('case.advance') or member_has('filing.record') or member_has('filing.verify'));

create policy "firm writes declarations" on declarations for insert
  with check (member_has('filing.record') or member_has('case.advance'));
create policy "firm updates declarations" on declarations for update
  using (member_has('filing.record') or member_has('filing.verify') or member_has('case.advance'))
  with check (member_has('filing.record') or member_has('filing.verify') or member_has('case.advance'));

create policy "firm writes engagements" on engagements for insert
  with check (member_has('engagement.create') or member_has('engagement.authorize'));
create policy "firm updates engagements" on engagements for update
  using (member_has('engagement.authorize') or member_has('engagement.revoke'))
  with check (member_has('engagement.authorize') or member_has('engagement.revoke'));

create policy "client writes messages" on messages for insert
  with check (taxpayer_id in (select client_taxpayer_ids()));
create policy "firm writes messages" on messages for insert
  with check (member_has('note.write_client'));
create policy "firm updates messages" on messages for update
  using (member_has('note.write_client'))
  with check (member_has('note.write_client'));

create policy "firm writes verdicts" on document_verdicts for insert
  with check (member_has('document.review'));
create policy "firm updates verdicts" on document_verdicts for update
  using (member_has('document.review'))
  with check (member_has('document.review'));

create policy "firm writes periods" on accounting_periods for insert
  with check (member_has('case.advance'));
create policy "firm updates periods" on accounting_periods for update
  using (member_has('case.advance'))
  with check (member_has('case.advance'));

create policy "firm writes tags" on account_tags for insert
  with check (member_has('case.advance'));
create policy "firm updates tags" on account_tags for update
  using (member_has('case.advance'))
  with check (member_has('case.advance'));

create policy "firm writes contact links" on contact_account_links for insert
  with check (member_has('case.advance'));
create policy "firm updates contact links" on contact_account_links for update
  using (member_has('case.advance'))
  with check (member_has('case.advance'));

create policy "firm manages portal accounts" on portal_accounts for insert
  with check (member_has('member.manage') or member_has('case.advance'));
create policy "firm updates portal accounts" on portal_accounts for update
  using (member_has('member.manage') or member_has('case.advance'))
  with check (member_has('member.manage') or member_has('case.advance'));

revoke select (otp_hash, otp_expires_at, failed_attempts) on portal_accounts from anon, authenticated;
revoke select (otp_hash, otp_expires_at, failed_attempts) on firm_members from anon, authenticated;
