-- F4 · Who may do what, and who approved what they themselves prepared.
--
-- Two kinds of actor, and they are NOT symmetrical. A client's access is per
-- link (contact <-> taxpayer, already in crm_contact_links): they can only ever
-- reach their own files. A firm member's access is per membership in the firm,
-- with a role. Modelling both as "a user with permissions" is how a client ends
-- up one misconfigured row away from another taxpayer's documents.

create type firm_role as enum ('firm_staff', 'firm_reviewer', 'firm_partner', 'kima_admin');

create table firm_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  -- No auth provider is wired yet, so a member is identified by the label that
  -- already appears in `compliance_cases.owner` and `case_events.actor_label`.
  -- When auth arrives this becomes a foreign key; until then the label is the
  -- join, and it must therefore be unique.
  person_label text not null,
  email text,
  role firm_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,

  -- A deactivated member is not a reduced member, it is a member with no
  -- authority at all, and the record has to say when that happened.
  constraint inactive_has_a_date check (active = (deactivated_at is null))
);

create unique index firm_members_person on firm_members (lower(btrim(person_label)));

alter table firm_members enable row level security;

-- Who works at the firm is not a secret from the firm's own clients -- the
-- client portal names the professional responsible for their file. Writes are
-- another matter and stay with the service role until auth exists.
create policy "members are readable" on firm_members for select using (true);

comment on table firm_members is
  'Firm-side actors and their roles. Client-side access is per contact link, not here.';
comment on column firm_members.role is
  'kima_admin can manage members and rules but has NO professional authority: it cannot review a document or verify a filing.';

-- -------------------------------------------------------------------------
-- Separation of duties
-- -------------------------------------------------------------------------

-- The oldest control in the trade: whoever prepared a return should not be the
-- one who passes it. Until now nothing recorded either fact, so the question
-- could not even be asked.
alter table compliance_cases
  add column prepared_by text,
  add column prepared_at timestamptz,
  add column approved_by text,
  add column approved_at timestamptz,
  -- Not a flag somebody sets to get past the constraint: it is the disclosure
  -- itself, and it travels with the case into the client's dossier.
  add column self_approved boolean not null default false;

-- THE CONTROL, and the reason it is shaped this way.
--
-- A hard `approved_by <> prepared_by` would be correct in a firm of five and
-- would make the product unusable for a sole practitioner, who is the first
-- customer. So self-approval is permitted and can never be SILENT: the row is
-- refused unless it admits what happened. A disclosure that is checked beats a
-- prohibition that gets worked around.
alter table compliance_cases
  add constraint self_approval_must_be_disclosed check (
    approved_by is null
    or prepared_by is null
    or lower(btrim(approved_by)) <> lower(btrim(prepared_by))
    or self_approved
  );

-- An approval has to say who and when, together.
alter table compliance_cases
  add constraint approval_is_dated check ((approved_by is null) = (approved_at is null));
alter table compliance_cases
  add constraint preparation_is_dated check ((prepared_by is null) = (prepared_at is null));

comment on column compliance_cases.prepared_by is
  'Who took the case into review. Stamped by the engine on entering `review`, never typed.';
comment on column compliance_cases.self_approved is
  'True when the same person prepared and approved. Permitted for a sole practitioner, disclosed in the dossier, never silent.';

-- The founding member, so the demo has an actor with real authority.
insert into firm_members (person_label, email, role)
values ('Irina', null, 'firm_partner')
on conflict do nothing;
