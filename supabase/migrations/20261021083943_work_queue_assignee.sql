-- The work queue is derived from tables that already exist; the only thing
-- missing is who has picked a piece of work up.
--
-- `text` is deliberate for the demo: there are no user accounts yet. In
-- production this becomes a foreign key to a membership, and claiming becomes
-- an authorised action rather than a client-supplied string.
alter table document_requests add column if not exists assignee text;
alter table declarations add column if not exists assignee text;

create index if not exists document_requests_assignee
  on document_requests (assignee) where assignee is not null;
create index if not exists declarations_assignee
  on declarations (assignee) where assignee is not null;
