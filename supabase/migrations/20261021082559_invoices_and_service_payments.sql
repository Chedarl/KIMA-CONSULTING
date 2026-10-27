-- Kima's own service fees. NOT tax paid to the DGI — the UI must never blur
-- the two, and nothing here implies a payment gateway or a DGI integration.
--
-- Money is bigint minor units. XAF has no subunit, so one minor unit is one
-- franc. Never floating point.

create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  number text not null,
  description_fr text not null,
  description_en text not null,
  currency char(3) not null default 'XAF' check (currency = 'XAF'),
  total_minor bigint not null check (total_minor >= 0),
  status text not null default 'issued' check (status in ('draft', 'issued', 'void')),
  issued_on date,
  due_on date,
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  check (status = 'draft' or (issued_on is not null and due_on is not null))
);

create table service_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  taxpayer_id uuid not null references taxpayers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'XAF',
  method text not null check (method in ('mtn_momo', 'orange_money', 'bank_transfer', 'cash')),
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'rejected')),
  provider_reference text,
  reported_by text not null check (reported_by in ('taxpayer', 'firm')),
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz not null default now(),
  -- The same shape as filed_requires_evidence: a payment is not confirmed
  -- because someone said so, but because there is something behind it.
  constraint confirmed_requires_evidence check (
    status <> 'confirmed'
    or (confirmed_at is not null and confirmed_by is not null and provider_reference is not null)
  )
);

create index on invoices (taxpayer_id, status, due_on);
create index on service_payments (invoice_id);
create index on service_payments (taxpayer_id, created_at desc);

alter table invoices enable row level security;
alter table service_payments enable row level security;

-- Draft invoices are hidden by policy, not merely by a query filter.
create policy demo_invoices_select on invoices for select to anon using (status <> 'draft');

create policy demo_payments_select on service_payments for select to anon using (true);
-- A client may report a payment; a client may never mark one confirmed.
create policy demo_payments_insert on service_payments for insert to anon
  with check (reported_by = 'taxpayer' and status = 'pending_confirmation');

alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table service_payments;

-- Synthetic invoices for the seeded demo taxpayer.
insert into invoices (organization_id, taxpayer_id, number, description_fr, description_en,
                      total_minor, status, issued_on, due_on)
select o.id, t.id, v.num, v.dfr, v.den, v.amt, 'issued', v.iss::date, v.due::date
from (select id from organizations order by created_at limit 1) o,
     (select id from taxpayers order by created_at limit 1) t,
     (values
       ('KMC-204', 'Déclarations mensuelles — septembre', 'Monthly declarations — September', 15000, '2026-10-18', '2026-11-02'),
       ('KMC-198', 'Déclarations mensuelles — août', 'Monthly declarations — August', 15000, '2026-09-18', '2026-10-03'),
       ('KMC-187', 'Organisation des pièces comptables', 'Records organisation support', 25000, '2026-08-12', '2026-08-27')
     ) as v(num, dfr, den, amt, iss, due);

-- One confirmed payment, with the reference that makes it confirmable.
insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method,
                              status, provider_reference, reported_by, confirmed_at, confirmed_by)
select i.id, i.taxpayer_id, i.organization_id, 15000, 'mtn_momo', 'confirmed',
       'MP260918.1432.A47219', 'taxpayer', now(), 'A. Nkeng'
from invoices i where i.number = 'KMC-198';
