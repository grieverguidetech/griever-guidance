begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test');

insert into public.profiles (id, sender_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Ann'),
  ('00000000-0000-0000-0000-00000000000b', 'Bob');

-- anon has no table privileges at all
set local role anon;
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'anon cannot select profiles');

-- user A
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'A sees exactly one row');
select is((select sender_name from public.profiles), 'Ann', 'A sees their own row');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 0, 'A cannot read B');

-- Cross-user update affects 0 rows silently; the later read of B as superuser proves it.
update public.profiles set sender_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000b';

-- Delete is denied outright (no grant, no policy), for own and other rows.
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'A cannot delete their own row');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', null, 'A cannot delete B');

select throws_ok(
  $$insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'A cannot insert a row for B');

select is((select count(*)::int from public.profiles), 1, 'A own row still present after denied deletes');

update public.profiles set sender_name = 'Ann2' where id = '00000000-0000-0000-0000-00000000000a';
select is((select sender_name from public.profiles), 'Ann2', 'A can update their own row');

select throws_ok($$update public.profiles set id = '00000000-0000-0000-0000-0000000000ff'$$,
  '42501', null, 'A cannot update id');
select throws_ok($$update public.profiles set created_at = now()$$,
  '42501', null, 'A cannot update created_at');

-- user C has no profile yet and can create their own
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select lives_ok($$insert into public.profiles (id, sender_name) values ('00000000-0000-0000-0000-00000000000c', 'Cy')$$,
  'C can insert their own row');
select is((select count(*)::int from public.profiles), 1, 'C sees exactly their own row');

-- B is untouched (read as superuser-level role)
reset role;
select is((select sender_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'Bob', 'B row unchanged by A');

select * from finish();
rollback;
