-- The public contact form could never write: the INSERT policy existed and
-- gates on allow_public_contact_inquiries, but the table-level grant was never
-- issued, so even with the flag on the insert failed with permission denied
-- before the policy ran. Column grants keep visitors on the message fields
-- only; this grants the table-level INSERT the policy was written for.

grant insert on public.contact_inquiries to anon, authenticated;
