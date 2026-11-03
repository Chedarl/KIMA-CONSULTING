-- ---------------------------------------------------------------------------
-- Inbuilt engagement templates: the starter library every firm sees on day one.
-- organization_id is null (shared); firms duplicate one to make it their own.
-- ---------------------------------------------------------------------------

create policy "everyone reads inbuilt templates" on public.engagement_templates
  for select to authenticated
  using (kind = 'inbuilt' and organization_id is null);

insert into public.engagement_templates (name, kind, services, stage_flow, letter, version)
values
  ('DSF annuelle (régime réel)', 'inbuilt',
   '["dsf"]'::jsonb,
   '["documents","accounting","preparation","review","filing","evidence","delivered"]'::jsonb,
   '{"subject":"Déclaration Statistique et Fiscale","scope":"Tenue, préparation et dépôt de la DSF annuelle","signature":"none"}'::jsonb, 1),
  ('TVA mensuelle', 'inbuilt',
   '["tax"]'::jsonb,
   '["documents","accounting","preparation","review","filing"]'::jsonb,
   '{"subject":"TVA mensuelle","scope":"Collecte, réconciliation et déclaration de TVA mensuelle","signature":"none"}'::jsonb, 1),
  ('Paie et cotisations (trimestriel)', 'inbuilt',
   '["payroll"]'::jsonb,
   '["documents","preparation","review","filing"]'::jsonb,
   '{"subject":"Paie et cotisations sociales","scope":"Établissement de la paie et des déclarations sociales","signature":"none"}'::jsonb, 1),
  ('Attestation de conformité', 'inbuilt',
   '["audit"]'::jsonb,
   '["documents","preparation","review","delivered"]'::jsonb,
   '{"subject":"Attestation de conformité","scope":"Revue et attestation de conformité fiscale","signature":"none"}'::jsonb, 1)
on conflict do nothing;
