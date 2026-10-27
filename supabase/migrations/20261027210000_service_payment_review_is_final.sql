-- D2 review of PR #6 (20261023052633_firm_confirms_service_payments.sql).
--
-- That migration let a partner with billing.manage UPDATE service_payments
-- with no limit on WHICH columns or FROM WHICH status. RLS cannot compare old
-- and new, so in the database a partner could:
--   - rewrite amount_minor, method, invoice_id, taxpayer_id or reported_by on
--     a payment the client reported;
--   - reopen or rewrite a payment that was already confirmed or rejected, so a
--     receipt could appear and disappear;
--   - type any name into confirmed_by and any time into confirmed_at.
-- lib/billing.ts reviewServicePayment() refuses all of this in the interface,
-- but the interface is not the guard. This trigger makes the database say the
-- same thing: only a pending payment moves, only to confirmed or rejected,
-- and only the review columns change. The database stamps who confirmed and
-- when.
--
-- Same shape as client_request_update_guard (20261027120000). Forward-only,
-- idempotent.

-- The signed-in firm member's own display label, and nothing else.
create or replace function public.current_member_label() returns text
language sql stable security definer set search_path = public as $$
  select person_label from firm_members
  where auth_user_id = auth.uid() and active
  limit 1
$$;

revoke all on function public.current_member_label() from public, anon;
grant execute on function public.current_member_label() to authenticated;

comment on function public.current_member_label() is
  'The calling firm member''s person_label, or null. Used to stamp service_payments.confirmed_by.';

-- Security invoker on purpose: current_user is then the API role of the caller.
create or replace function public.service_payment_review_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  label text;
begin
  -- Operators (migrations, the SQL editor, service role) are not API callers.
  if auth.uid() is null and current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if old.status <> 'pending_confirmation' then
    raise exception 'a confirmed or rejected fee payment is final; record a new payment instead'
      using errcode = '42501';
  end if;

  if new.status not in ('confirmed', 'rejected') then
    raise exception 'a pending fee payment may move only to confirmed or rejected'
      using errcode = '42501';
  end if;

  -- What the payer reported is evidence. The review does not rewrite it.
  if (new.id, new.invoice_id, new.taxpayer_id, new.organization_id, new.amount_minor,
      new.currency, new.method, new.reported_by, new.created_at)
     is distinct from
     (old.id, old.invoice_id, old.taxpayer_id, old.organization_id, old.amount_minor,
      old.currency, old.method, old.reported_by, old.created_at)
  then
    raise exception 'a fee payment review may change only its status and confirmation'
      using errcode = '42501';
  end if;

  if new.status = 'rejected' then
    if new.provider_reference is distinct from old.provider_reference
       or new.confirmed_at is not null or new.confirmed_by is not null then
      raise exception 'a rejected fee payment carries no confirmation'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Confirmed: the database, not the browser, says who and when.
  label := current_member_label();
  if label is null then
    raise exception 'only a signed-in firm member may confirm a fee payment'
      using errcode = '42501';
  end if;
  new.confirmed_by := label;
  new.confirmed_at := now();
  return new;
end $$;

drop trigger if exists service_payment_review_guard on public.service_payments;
create trigger service_payment_review_guard
  before update on public.service_payments
  for each row execute function public.service_payment_review_guard();

-- A firm member may record a payment only as the firm, and only as pending.
-- Before this, payment.record (staff and reviewers too) could insert a row
-- already 'confirmed', or claim reported_by = 'taxpayer', skipping the
-- billing.manage review above.
drop policy if exists "firm writes payments" on public.service_payments;
create policy "firm writes payments" on public.service_payments
  for insert
  with check (
    member_has('payment.record')
    and reported_by = 'firm'
    and status = 'pending_confirmation'
    and confirmed_at is null
    and confirmed_by is null
  );
