-- Messages: the most sensitive content in the demo, so the few server-side
-- bounds that are cheap to add are worth adding now.

alter table messages
  add constraint messages_body_len check (char_length(body) between 1 and 4000);

create index if not exists messages_tp_created on messages (taxpayer_id, created_at);
create index if not exists messages_unread on messages (taxpayer_id) where read_at is null;

-- A column grant so nobody holding the publishable key can rewrite the text of
-- a message after the fact. Marking one read is the only update allowed.
revoke update on messages from anon;
grant update (read_at) on messages to anon;
