-- T-355 .. T-361: the public contact inbox has a ceiling.
--
-- allow_public_contact_inquiries is enabled in production and the form posts
-- straight to PostgREST from the browser (lib/submit-kima-contact.ts), so the
-- INSERT policy asking only whether the flag was on left one script able to
-- fill the table. 20261030182000 had already said where the fix belongs:
-- "PostgREST exposes direct INSERT; a web route's throttle is not enough."
--
-- T-358 is the assertion that matters most: it sends the whole flood as ONE
-- statement. A `with check` counting existing rows would read the pre-statement
-- snapshot and let every element through, which is why the ceiling is an AFTER
-- STATEMENT trigger over a transition table instead.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

update app_flags set enabled = true where key = 'allow_public_contact_inquiries';

-- T-355 the column exists, is NOT NULL, and is in nobody's insert grant, so a
-- visitor cannot choose its own bucket.
select is(
  (select coalesce(string_agg(column_name, ',' order by column_name), '(none)')
     from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'contact_inquiries'
      and grantee = 'anon' and privilege_type = 'INSERT'),
  'contact_email,contact_name,contact_phone,inquiry_kind,note,preferred_language',
  'T-355 source_key is absent from the visitor''s insert grant');

set local role anon;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '{"x-forwarded-for":"41.202.1.5, 10.0.0.1"}', true);

-- T-356 three in the hour are accepted.
select lives_ok($$insert into contact_inquiries
  (contact_name, contact_email, inquiry_kind, preferred_language, note)
  select 'Visitor ' || g, 'v' || g || '@example.test', 'individual', 'fr', 'question'
    from generate_series(1, 3) g$$,
  'T-356 three messages in the hour from one sender are accepted');

-- T-357 the fourth is refused.
select throws_ok($$insert into contact_inquiries
  (contact_name, contact_email, inquiry_kind, preferred_language)
  values ('Fourth', 'fourth@example.test', 'individual', 'fr')$$,
  '53400', null,
  'T-357 the fourth in the same hour is refused');

reset role;
delete from contact_inquiries;
set local role anon;
select set_config('request.headers', '{"x-forwarded-for":"102.64.7.7"}', true);

-- T-358 THE ONE A POLICY PREDICATE WOULD MISS: 50 rows in a single statement.
select throws_ok($$insert into contact_inquiries
  (contact_name, contact_email, inquiry_kind, preferred_language)
  select 'Flood ' || g, 'f' || g || '@example.test', 'individual', 'fr'
    from generate_series(1, 50) g$$,
  '53400', null,
  'T-358 a 50-row bulk insert in one statement is refused whole');

reset role;
select is((select count(*) from contact_inquiries), 0::bigint,
  'T-359 and nothing from that statement is left behind');

-- T-360 the daily ceiling, with the hour deliberately clear: ten seeded an hour
-- apart, so only the 24-hour window can refuse the next one.
-- One real visitor insert stamps the bucket; the seeds copy it off that row,
-- so this reads the DEFAULT's own output and never touches the salt table.
set local role anon;
select set_config('request.headers', '{"x-forwarded-for":"41.202.1.5"}', true);
insert into contact_inquiries
  (contact_name, contact_email, inquiry_kind, preferred_language)
  values ('Bucket seed', 'bucket@example.test', 'individual', 'fr');
reset role;

insert into contact_inquiries
  (contact_name, contact_email, inquiry_kind, preferred_language, source_key, received_at)
select 'Seed ' || g, 's' || g || '@example.test', 'individual', 'fr',
       (select source_key from contact_inquiries
         where contact_email = 'bucket@example.test'),
       now() - (g || ' hours')::interval
  from generate_series(2, 10) g;

-- Push the one live row out of the hour so only the daily window can refuse.
update contact_inquiries set received_at = now() - interval '90 minutes'
 where contact_email = 'bucket@example.test';

set local role anon;
select set_config('request.headers', '{"x-forwarded-for":"41.202.1.5"}', true);
select throws_ok($$insert into contact_inquiries
  (contact_name, contact_email, inquiry_kind, preferred_language)
  values ('Eleventh', 'eleventh@example.test', 'individual', 'fr')$$,
  '53400', null,
  'T-360 the eleventh in the day is refused with the hour clear');

-- T-361 a different sender is unaffected: the ceiling is per sender, not global.
select set_config('request.headers', '{"x-forwarded-for":"197.255.9.9"}', true);
select lives_ok($$insert into contact_inquiries
  (contact_name, contact_email, inquiry_kind, preferred_language)
  values ('Someone else', 'else@example.test', 'business', 'en')$$,
  'T-361 another sender is unaffected by the first sender''s ceiling');

reset role;
select * from finish();
rollback;
