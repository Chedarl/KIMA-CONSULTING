-- Revoking UPDATE and DELETE is not enough: TRUNCATE was still granted by the
-- schema default, and a log that can be emptied in one statement is not
-- append-only either. The service role keeps its privileges, so the guarantee
-- is precisely: no client key can rewrite or erase a case history.
revoke truncate on case_events from anon, authenticated;
