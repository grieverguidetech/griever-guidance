begin;
select plan(41);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e@example.test'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test');

insert into public.profiles (id, sender_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Ann'),
  ('00000000-0000-0000-0000-00000000000b', 'Bob'),
  ('00000000-0000-0000-0000-00000000000c', 'Cy');

-- Setup as superuser: A owns B; A has one open invite; C has an unrelated invite.
insert into public.memberships (owner_id, member_id)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
insert into public.invites (owner_id, email, token_hash) values
  ('00000000-0000-0000-0000-00000000000a', 'x@example.test', repeat('a',64)),
  ('00000000-0000-0000-0000-00000000000c', 'y@example.test', repeat('c',64));

-- Constraints, as superuser.
select is((select account_type from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'owner', 'a new profile row defaults to owner');
select throws_ok($$update public.profiles set account_type = 'admin'$$, '23514', null, 'account_type check rejects other values');
select throws_ok($$insert into public.memberships (owner_id, member_id) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c')$$,
  '23514', null, 'cannot be your own member');
select throws_ok($$insert into public.memberships (owner_id, member_id) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b')$$,
  '23505', null, 'a member has one owner');
select throws_ok($$insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-00000000000a', 'Upper@example.test', repeat('1',64))$$,
  '23514', null, 'invite email must be lowercase');
select throws_ok($$insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-00000000000a', 'x@example.test', repeat('2',64))$$,
  '23505', null, 'second open invite for the same owner and email is rejected');
select lives_ok($$update public.invites set revoked_at = now() where token_hash = repeat('a',64);
  insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-00000000000a', 'x@example.test', repeat('3',64))$$,
  'a new invite is allowed once the old one is revoked');

select throws_ok($$insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-00000000000a', 'w@example.test', 'not-a-hash')$$,
  '23514', null, 'token_hash must be sha256 hex');
select throws_ok($$insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-00000000000a', 'nodomain', repeat('5',64))$$,
  '23514', null, 'invite email needs an @');
select throws_ok($$insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-00000000000a', ' pad@example.test', repeat('6',64))$$,
  '23514', null, 'invite email must not have padding');
select throws_ok($$insert into public.invites (owner_id, email, token_hash, expires_at) values ('00000000-0000-0000-0000-00000000000a', 'v@example.test', repeat('7',64), now() - interval '1 day')$$,
  '23514', null, 'expires_at must be after created_at');
select ok(not has_table_privilege('anon', 'public.memberships', 'INSERT, UPDATE, DELETE, TRUNCATE')
  and not has_table_privilege('authenticated', 'public.memberships', 'INSERT, UPDATE, DELETE, TRUNCATE')
  and not has_table_privilege('anon', 'public.invites', 'INSERT, UPDATE, DELETE, TRUNCATE')
  and not has_table_privilege('authenticated', 'public.invites', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'no client role has write privileges on memberships or invites');

-- anon: nothing at all
set local role anon;
select throws_ok($$select count(*) from public.memberships$$, '42501', null, 'anon cannot select memberships');
select throws_ok($$select count(*) from public.invites$$, '42501', null, 'anon cannot select invites');
select throws_ok($$select token_hash from public.invites$$, '42501', null, 'anon cannot select token_hash');
select throws_ok($$insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-00000000000a', 'q@example.test', repeat('8',64))$$,
  '42501', null, 'anon cannot insert an invite');
select throws_ok($$insert into public.memberships (owner_id, member_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'anon cannot insert a membership');

-- A: the owner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.memberships), 1, 'owner sees their membership row');
select is((select count(*)::int from public.invites where email = 'x@example.test'), 2, 'owner sees their own invites');
select is((select count(*)::int from public.invites where owner_id <> auth.uid()), 0, 'owner does not see another owner''s invites');
select throws_ok($$select token_hash from public.invites$$, '42501', null, 'owner cannot select token_hash');
select throws_ok($$select * from public.invites$$, '42501', null, 'owner cannot select * from invites');
select throws_ok($$select id from public.invites where token_hash = repeat('a',64)$$, '42501', null, 'owner cannot filter by token_hash');
select throws_ok($$update public.profiles set account_type = 'member' where id = auth.uid()$$,
  '42501', null, 'owner cannot write account_type');
select throws_ok($$insert into public.memberships (owner_id, member_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'client cannot insert a membership');
select throws_ok($$update public.memberships set owner_id = owner_id$$, '42501', null, 'client cannot update memberships');
select throws_ok($$delete from public.memberships$$, '42501', null, 'client cannot delete memberships');
select throws_ok($$insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-00000000000a', 'z@example.test', repeat('4',64))$$,
  '42501', null, 'client cannot insert an invite');
select throws_ok($$update public.invites set revoked_at = now()$$, '42501', null, 'client cannot update invites');
select throws_ok($$delete from public.invites$$, '42501', null, 'client cannot delete invites');

-- B: the member
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.memberships), 1, 'member sees their membership row');
select is((select count(*)::int from public.invites), 0, 'member sees no invites');
select throws_ok($$update public.profiles set account_type = 'owner' where id = auth.uid()$$,
  '42501', null, 'member cannot write account_type');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
select throws_ok($$insert into public.profiles (id, account_type) values ('00000000-0000-0000-0000-0000000000ee', 'member')$$,
  '42501', null, 'client cannot insert account_type (own id, no profile yet)');

-- stranger: a user with no membership and no invites of A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
select is((select count(*)::int from public.memberships), 0, 'stranger sees 0 memberships');
select is((select count(*)::int from public.invites), 0, 'stranger sees 0 invites');

-- C owns only their own invite
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.invites), 1, 'C sees only their own invite');

-- Back to superuser: account_type cannot drift when a membership goes.
reset role;
update public.profiles set account_type = 'member' where id = '00000000-0000-0000-0000-00000000000b';
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select account_type from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'owner', 'deleting the owner returns the member to owner');
select is((select count(*)::int from public.memberships), 0, 'owner deletion removed the membership');

-- accepted_by is nulled, not blocking, when the accepter's account is deleted.
update public.invites set accepted_at = now(), accepted_by = '00000000-0000-0000-0000-00000000000b'
  where owner_id = '00000000-0000-0000-0000-00000000000c';
select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000b'$$,
  'deleting the user who accepted an invite works');
select is((select accepted_by from public.invites where owner_id = '00000000-0000-0000-0000-00000000000c'),
  null, 'accepted_by becomes null');

select * from finish();
rollback;
