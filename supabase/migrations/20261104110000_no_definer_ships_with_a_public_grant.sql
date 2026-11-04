-- Three SECURITY DEFINER functions reached production holding a bare PUBLIC
-- execute grant, which is `anon` as well:
--
--   public.upsert_branding                  (20261103170000)
--   public.upsert_engagement_template       (20261103200000)
--   public.instantiate_engagement_template  (20261103210000)
--
-- Each `grant execute ... to authenticated` without first revoking from PUBLIC,
-- and in Postgres a function is executable by PUBLIC by default. So the grant
-- to `authenticated` was decoration: everyone already had it. Supabase's own
-- linter reports all three under "Public Can Execute SECURITY DEFINER
-- Function".
--
-- None of the three is exploitable today. Each derives the firm from
-- private.current_member_org() and raises before touching a row:
--
--   anon -> upsert_branding                 "A firm member is required to brand a workspace."
--   anon -> upsert_engagement_template      "A firm member is required to manage templates."
--   anon -> instantiate_engagement_template "A firm member is required."
--
-- Verified against a clean 116-migration replay rather than assumed. So this is
-- hygiene, not an incident -- but it is the hygiene that decides whether the
-- NEXT function written to this pattern fails closed or not, and three in a row
-- means the pattern is the house style now unless something stops it.
--
-- Every other definer helper in this repo revokes first, e.g.
-- 20261103130000: `revoke all on function public.client_taxpayer_ids() from
-- public, anon;`. These three now match.

revoke all on function public.upsert_branding(text, uuid, text, text, text, text, text)
  from public, anon;
grant execute on function public.upsert_branding(text, uuid, text, text, text, text, text)
  to authenticated;

revoke all on function public.upsert_engagement_template(uuid, text, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.upsert_engagement_template(uuid, text, jsonb, jsonb, jsonb)
  to authenticated;

revoke all on function public.instantiate_engagement_template(uuid, uuid)
  from public, anon;
grant execute on function public.instantiate_engagement_template(uuid, uuid)
  to authenticated;
