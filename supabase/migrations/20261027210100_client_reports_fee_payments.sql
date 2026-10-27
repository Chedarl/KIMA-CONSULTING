-- D6 (owner, 27 Oct 2026): clients may report fee payments.
--
-- Until now RLS refused every client insert into service_payments (only
-- payment.record could insert), so the client "report a payment" action in
-- components/live/payments-panel.tsx always showed the failure toast, and a
-- client could not read their own payment history either.
--
-- A report is not a confirmation. The client may insert only the reported
-- state, for an issued invoice of a taxpayer they hold, under that invoice's
-- own taxpayer and firm, with no confirmation fields. Confirming stays with
-- billing.manage, through service_payment_review_guard (20261027210000).
-- lib/billing.ts feePaymentState() shows such a row as "Paiement signalé — à
-- confirmer", never "paid".
--
-- Not organisation-scoped beyond the invoice's own organization_id: member_has()
-- is not per-organisation yet (D7, backlog P2-5, blocking before a second firm).
-- Forward-only, idempotent.

drop policy if exists "client reports fee payments" on public.service_payments;
create policy "client reports fee payments" on public.service_payments
  for insert to authenticated
  with check (
    status = 'pending_confirmation'
    and reported_by = 'taxpayer'
    and confirmed_at is null
    and confirmed_by is null
    and currency = 'XAF'
    -- The client cannot backdate a report: the row's time is the insert's.
    and created_at = now()
    and taxpayer_id in (select client_taxpayer_ids())
    and exists (
      select 1 from public.invoices i
      where i.id = service_payments.invoice_id
        and i.taxpayer_id = service_payments.taxpayer_id
        and i.organization_id = service_payments.organization_id
        and i.status = 'issued'
    )
  );

drop policy if exists "client reads own payments" on public.service_payments;
create policy "client reads own payments" on public.service_payments
  for select to authenticated
  using (taxpayer_id in (select client_taxpayer_ids()));

comment on policy "client reports fee payments" on public.service_payments is
  'D6: a client reports (pending_confirmation, reported_by taxpayer) against an issued invoice of their own taxpayer. Never confirms.';
