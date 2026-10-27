-- The client panel already reports a fee payment as pending_confirmation, and
-- confirmed_requires_evidence already refuses a confirmed row without a
-- reference, a person and a time. What was missing is a policy that lets a
-- partner with billing.manage record that confirmation.
--
-- Invoice issuance stays closed. This migration does not add an insert or
-- update policy on invoices, and it does not touch compliance_cases.billing_status.

drop policy if exists "firm confirms service payments" on public.service_payments;
create policy "firm confirms service payments" on public.service_payments
  for update
  using (member_has('billing.manage'))
  with check (member_has('billing.manage'));
