-- The registrations INSERT policy was table-wide `with check (true)`: any
-- caller, including anon, could write every column. That let a stranger forge
-- `status='approved'/'rejected'` (the decision CHECKs are satisfiable), backdate
-- `decided_at`, set `decided_by`/`decision_note`, or point `taxpayer_id` at any
-- taxpayer -- polluting a firm's review queue and the registration KPIs.
--
-- Narrow it to the applicant fields, exactly as contact_inquiries was narrowed
-- in 20261030182000: a column-level INSERT grant leaves `status` at its
-- 'submitted' default and the lifecycle columns server-managed. The firm still
-- reads and updates its own applications through the RLS policies added in
-- 20261030163000. Column grants cannot be carved out of a table-wide one, so the
-- table grant is revoked first (same shape as 20261022163452).
revoke all on public.registrations from public, anon, authenticated;

grant insert (
  applicant_name, applicant_email, applicant_phone,
  taxpayer_type, legal_name, declared_niu, declared_regime, declared_centre,
  identity_document_ref, organization_id,
  intake_channel, preferred_language, workspace_kind, workspace_ref, onboarding
) on public.registrations to anon, authenticated;

-- The firm still reads and updates its own applications, scoped by RLS.
grant select on public.registrations to authenticated;
grant update on public.registrations to authenticated;
