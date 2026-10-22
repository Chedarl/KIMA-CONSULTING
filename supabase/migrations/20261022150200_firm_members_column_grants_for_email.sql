-- The previous migration's `revoke select (email)` was a no-op, and quietly so:
-- a table-wide SELECT grant cannot be partially revoked at column level, and
-- Postgres accepts the statement without complaint. The table grant has to go
-- first, then SELECT is granted column by column.
--
-- Verified after applying: information_schema.column_privileges no longer
-- lists `email` for anon or authenticated.
revoke select on firm_members from anon, authenticated;

grant select (id, organization_id, person_label, role, active, created_at, deactivated_at)
  on firm_members to anon, authenticated;
