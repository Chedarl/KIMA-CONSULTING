-- The previous part's `revoke select (otp_hash, otp_expires_at,
-- failed_attempts) on portal_accounts` was a SILENT NO-OP: Postgres keeps
-- table-level and column-level grants separately, and a column revoke does
-- nothing while a table-wide SELECT grant stands. Verified after applying:
-- anon still held SELECT on otp_hash.
--
-- That is not cosmetic. The stored value is sha256(code || id), the id is in
-- the same row, and the code is eight digits -- so a reader of otp_hash can
-- recover the code offline by trying ten million hashes, which is seconds of
-- CPU. Reading the hash is reading the code.
--
-- Same fix as firm_members.email took in 20261022163432/163452: revoke the
-- table grant, then grant back the columns that are not secrets. No
-- application code selects this table at all -- sign-in goes through the
-- security-definer RPCs -- so anon gets nothing and an authenticated firm
-- member gets the administrative columns only.

revoke select on portal_accounts from anon, authenticated;

grant select (id, taxpayer_id, contact_id, identifier, display_name, status, last_sign_in_at, created_at)
  on portal_accounts to authenticated;

comment on column portal_accounts.otp_hash is
  'Secret. No role but service_role may read this: an 8-digit code behind sha256 is recoverable offline.';
