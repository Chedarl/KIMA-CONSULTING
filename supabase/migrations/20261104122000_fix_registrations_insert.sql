-- The registrations INSERT policy was table-wide `with check (true)`: any
-- caller, including anon, could write every column. That let a stranger forge
-- `status='approved'/'rejected'` (the decision CHECKs are satisfiable), backdate
-- `decided_at`, set `decided_by`/`decision_note`, or point `taxpayer_id` at any
-- taxpayer -- polluting a firm's review queue and the registration KPIs.
--
-- Narrow only the INSERT privilege to the applicant fields. `status` stays at
-- its 'submitted' default and the lifecycle columns stay server-managed.
--
-- SELECT and UPDATE grants are left in place: the RLS policies from
-- 20261030163000 and the existing negative tests rely on them (anon SELECT must
-- return zero rows through RLS, not a permission error). Column grants cannot be
-- carved out of a table-wide one, so the table-wide INSERT is revoked first
-- (same shape as 20261022163452).
revoke insert on public.registrations from public, anon, authenticated;

grant insert (
  applicant_name, applicant_email, applicant_phone,
  taxpayer_type, legal_name, declared_niu, declared_regime, declared_centre,
  identity_document_ref, organization_id,
  intake_channel, preferred_language, workspace_kind, workspace_ref, onboarding
) on public.registrations to anon, authenticated;
