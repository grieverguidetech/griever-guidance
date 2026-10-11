begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

insert into public.profiles (id, sender_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Ann'),
  ('00000000-0000-0000-0000-00000000000b', 'Bob');

-- anon sees nothing
set local role anon;
select is((select count(*)::int from public.profiles), 0, 'anon sees no profiles');

-- user A
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is((select count(*)::int from public.profiles), 1, 'A sees exactly one row');
select is((select sender_name from public.profiles), 'Ann', 'A sees their own row');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 0, 'A cannot read B');

update public.profiles set sender_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000b';
delete from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
delete from public.profiles where id = '00000000-0000-0000-0000-00000000000b';

select throws_ok(
  $$insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'A cannot insert a row for B');

select is((select count(*)::int from public.profiles), 1, 'A own row survives delete (no delete policy)');

update public.profiles set sender_name = 'Ann2' where id = '00000000-0000-0000-0000-00000000000a';
select is((select sender_name from public.profiles), 'Ann2', 'A can update their own row');

-- B is untouched (check as superuser-level role)
reset role;
select is((select sender_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'Bob', 'B row unchanged by A');

select * from finish();
rollback;
