-- D1 / OD-2: canonical name hygiene for the future atomic firm sign-up.
-- Synthetic examples, no claim about any Cameroonian legal number format.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

select has_function('private', 'firm_name_key', array['text'],
  'T-189 a single canonical name-key helper exists');
select is(private.firm_name_key('Cabinet Étoile & Associés SARL'),
  'etoile', 'T-190 accents and legal terms cannot disguise the same firm');
select is(private.firm_name_key('ÉTOILE, S.A.R.L.'),
  'etoile', 'T-191 punctuation and spaced legal abbreviations normalize');
select is(private.firm_name_key('Société Horizon SA'),
  'horizon', 'T-192 legal-form prefixes and suffixes normalize');
select is(private.firm_name_key('Acme Global'),
  'acme global', 'T-193 meaningful different words remain distinguishable');

insert into organizations (id, name, kind, registration_number) values
 ('00000000-0000-4000-c000-00000000e501', 'Cabinet Étoile & Associés SARL', 'firm', 'HYG-001');

select throws_ok(
 $$ insert into organizations (id, name, kind, registration_number)
    values ('00000000-0000-4000-c000-00000000e502', 'ÉTOILE, S.A.R.L.', 'firm', 'HYG-002') $$,
 '23505', null, 'T-194 look-alike firm name cannot register again');

select lives_ok(
 $$ insert into organizations (id, name, kind, registration_number)
    values ('00000000-0000-4000-c000-00000000e503', 'Horizon SARL', 'firm', 'HYG-003') $$,
 'T-195 a different named accounting firm is allowed');

select lives_ok(
 $$ insert into organizations (id, name, kind)
    values ('00000000-0000-4000-c000-00000000e504', 'ÉTOILE SARL', 'kima') $$,
 'T-196 platform vendor kind is not included in firm-only uniqueness');

select * from finish();
rollback;
