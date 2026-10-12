begin;
select plan(67);

-- Users: O owner, J joiner, S stranger, M existing member of O, N owner of M? (see below),
-- W wrong-email user, U unconfirmed, R rate-limit owner, Q open-limit owner, X owner who is a member.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'o@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'j@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u@example.test', null),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'q@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'y@example.test', now());

insert into public.profiles (id, sender_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Olive'),
  ('00000000-0000-0000-0000-0000000000a2', 'Jo'),
  ('00000000-0000-0000-0000-0000000000a3', 'Sam'),
  ('00000000-0000-0000-0000-0000000000a4', 'Max'),
  ('00000000-0000-0000-0000-0000000000a5', 'Una'),
  ('00000000-0000-0000-0000-0000000000a6', 'Rae'),
  ('00000000-0000-0000-0000-0000000000a7', 'Quin'),
  ('00000000-0000-0000-0000-0000000000a8', 'Xan'),
  ('00000000-0000-0000-0000-0000000000a9', 'Yan');

-- M is O's member (set through the table, as a superuser, as the accept would).
insert into public.memberships (owner_id, member_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4');
update public.profiles set account_type = 'member' where id = '00000000-0000-0000-0000-0000000000a4';
-- X is a member of Y, so X is not an owner and Y has a member.
insert into public.memberships (owner_id, member_id)
  values ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a8');
update public.profiles set account_type = 'member' where id = '00000000-0000-0000-0000-0000000000a8';

-- Seeded invites for J's email, one per failure mode (distinct owners/emails avoid the open-invite index).
insert into public.invites (owner_id, email, token_hash, created_at, expires_at, accepted_at, revoked_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'old@example.test', repeat('e',64), now() - interval '10 days', now() - interval '3 days', null, null),
  ('00000000-0000-0000-0000-0000000000a1', 'used@example.test', repeat('f',64), now() - interval '1 day', now() + interval '6 days', now(), null),
  ('00000000-0000-0000-0000-0000000000a1', 'revoked@example.test', repeat('d',64), now() - interval '1 day', now() + interval '6 days', null, now()),
  ('00000000-0000-0000-0000-0000000000a1', 'j@example.test', repeat('b',64), now(), now() + interval '7 days', null, null),
  ('00000000-0000-0000-0000-0000000000a1', 'u@example.test', repeat('c',64), now(), now() + interval '7 days', null, null),
  ('00000000-0000-0000-0000-0000000000a8', 'j@example.test', repeat('9',64), now(), now() + interval '7 days', null, null),
  ('00000000-0000-0000-0000-0000000000a1', 'o@example.test', repeat('8',64), now(), now() + interval '7 days', null, null);
-- Q already has 20 open invites older than a day (so only the open limit applies).
insert into public.invites (owner_id, email, token_hash, created_at, expires_at)
select '00000000-0000-0000-0000-0000000000a7', 'q' || g || '@example.test', lpad(to_hex(g + 4096), 64, '0'),
       now() - interval '2 days', now() + interval '5 days'
from generate_series(1, 20) g;

-- Reports sqlstate, message and detail of whatever a statement raises (as the current role).
create function pg_temp.err(q text) returns text language plpgsql as $f$
declare s text; m text; d text;
begin
  execute q;
  return 'no error';
exception when others then
  get stacked diagnostics s = returned_sqlstate, m = message_text, d = pg_exception_detail;
  return s || '|' || m || '|' || coalesce(d, '');
end;
$f$;

-- Privileges: anon cannot execute any function; authenticated can.
select ok(not has_function_privilege('anon', 'public.create_invite(text,text)', 'execute'), 'anon cannot execute create_invite');
select ok(not has_function_privilege('anon', 'public.accept_invite(text)', 'execute'), 'anon cannot execute accept_invite');
select ok(not has_function_privilege('anon', 'public.list_members()', 'execute'), 'anon cannot execute list_members');
select ok(not has_function_privilege('anon', 'public.revoke_invite(uuid)', 'execute'), 'anon cannot execute revoke_invite');
select ok(not has_function_privilege('anon', 'public.remove_member(uuid)', 'execute'), 'anon cannot execute remove_member');
select ok(has_function_privilege('authenticated', 'public.create_invite(text,text)', 'execute')
  and has_function_privilege('authenticated', 'public.accept_invite(text)', 'execute')
  and has_function_privilege('authenticated', 'public.list_members()', 'execute')
  and has_function_privilege('authenticated', 'public.revoke_invite(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.remove_member(uuid)', 'execute'),
  'authenticated can execute all five');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('create_invite','accept_invite','list_members','revoke_invite','remove_member')
    and p.prosecdef and p.proconfig @> array['search_path=""']), 5, 'all five are security definer with an empty search_path');

set local role anon;
select throws_ok($$select public.list_members()$$, '42501', null, 'anon calling list_members is refused');
select throws_ok($$select public.accept_invite(repeat('b',64))$$, '42501', null, 'anon calling accept_invite is refused');

-- ===== create_invite =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"o@example.test"}', true);

select isnt(public.create_invite('  New@Example.test ', repeat('1',64)), null, 'owner can invite; email is trimmed and lower-cased');
select throws_ok($$select public.create_invite('new@example.test', repeat('2',64))$$, 'PT409', 'already_invited', 'a second open invite to the same email is a conflict');
select throws_ok($$select public.create_invite('O@example.test', repeat('3',64))$$, 'PT400', 'invalid_invite', 'cannot invite your own email');
select throws_ok($$select public.create_invite('m@example.test', repeat('3',64))$$, 'PT409', 'already_member', 'cannot invite someone who is already your member');
select throws_ok($$select public.create_invite('nodomain', repeat('3',64))$$, 'PT400', 'invalid_invite', 'bad email is refused');
select throws_ok($$select public.create_invite('ok@example.test', 'not-a-hash')$$, 'PT400', 'invalid_invite', 'only a sha256 hex is accepted');
select throws_ok($$select public.create_invite('ok@example.test', upper(repeat('a',64)))$$, 'PT400', 'invalid_invite', 'uppercase hex is refused');
select throws_ok($$select public.create_invite('dup@example.test', repeat('1',64))$$, 'PT409', 'already_invited', 'a reused token hash is a conflict');
select is(pg_temp.err($$select public.create_invite('dup@example.test', repeat('1',64))$$), 'PT409|already_invited|', 'a reused hash leaks no key detail');

-- re-invite after expiry
select isnt(public.create_invite('old@example.test', repeat('4',64)), null, 'owner can re-invite an email whose invite expired');
reset role;
select is((select revoked_at is not null from public.invites where token_hash = repeat('e',64)), true, 'the expired invite was revoked');
select is((select count(*)::int from public.invites where owner_id = '00000000-0000-0000-0000-0000000000a1' and email = 'old@example.test' and revoked_at is null), 1, 'exactly one open invite for the re-invited email');
select is((select count(*)::int from public.invites where token_hash = repeat('4',64)), 1, 'only the hash is stored');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated","email":"m@example.test"}', true);
select throws_ok($$select public.create_invite('z@example.test', repeat('5',64))$$, 'PT403', 'not_allowed', 'a member cannot invite');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated","email":"u@example.test"}', true);
select throws_ok($$select public.create_invite('z@example.test', repeat('5',64))$$, 'PT403', 'not_allowed', 'an unconfirmed email cannot invite');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","email":"s@example.test"}', true);
select isnt(public.create_invite('z@example.test', repeat('5',64)), null, 'a fresh owner can invite');

-- rate limit: 10 per 24h trips at 11
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated","email":"r@example.test"}', true);
select lives_ok($$select public.create_invite('r' || g || '@example.test', lpad(to_hex(g + 100), 64, '0')) from generate_series(1, 10) g$$, 'ten invites in 24h are allowed');
select throws_ok($$select public.create_invite('r11@example.test', lpad(to_hex(111), 64, '0'))$$, 'PT429', 'rate_limited', 'the 11th invite in 24h is refused');
-- open limit: Q has 20 open
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated","email":"q@example.test"}', true);
select throws_ok($$select public.create_invite('q21@example.test', lpad(to_hex(999), 64, '0'))$$, 'PT429', 'rate_limited', 'the 21st open invite is refused');

-- ===== accept_invite =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","email":"s@example.test"}', true);
select throws_ok($$select public.accept_invite(repeat('0',64))$$, 'PT404', 'invite_unusable', 'a stranger with a made-up token: unusable');
select throws_ok($$select public.accept_invite(repeat('b',64))$$, 'PT404', 'invite_unusable', 'wrong email: unusable');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","email":"j@example.test"}', true);
select throws_ok($$select public.accept_invite(repeat('e',64))$$, 'PT404', 'invite_unusable', 'expired: unusable');
select throws_ok($$select public.accept_invite(repeat('f',64))$$, 'PT404', 'invite_unusable', 'already used: unusable');
select throws_ok($$select public.accept_invite(repeat('d',64))$$, 'PT404', 'invite_unusable', 'revoked: unusable');
select throws_ok($$select public.accept_invite(repeat('9',64))$$, 'PT404', 'invite_unusable', 'owner who is someone''s member: unusable');
select throws_ok($$select public.accept_invite(null)$$, 'PT404', 'invite_unusable', 'null token: unusable');
-- identical sqlstate, message and (empty) detail across failure modes
select is(pg_temp.err($$select public.accept_invite(repeat('0',64))$$), 'PT404|invite_unusable|', 'unknown token error text');
select is(pg_temp.err($$select public.accept_invite(repeat('e',64))$$), pg_temp.err($$select public.accept_invite(repeat('0',64))$$), 'expired and unknown tokens give identical errors');
select is(pg_temp.err($$select public.accept_invite(repeat('f',64))$$), pg_temp.err($$select public.accept_invite(repeat('d',64))$$), 'used and revoked give identical errors');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"o@example.test"}', true);
select throws_ok($$select public.accept_invite(repeat('8',64))$$, 'PT404', 'invite_unusable', 'an owner cannot accept their own invite');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated","email":"u@example.test"}', true);
select throws_ok($$select public.accept_invite(repeat('c',64))$$, 'PT404', 'invite_unusable', 'an unconfirmed email cannot accept');
-- a joiner who already has a member of their own, or is a member: conflict (after the token checks)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated","email":"m@example.test"}', true);
reset role;
insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-0000000000a6', 'm@example.test', repeat('7',64));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated","email":"m@example.test"}', true);
select throws_ok($$select public.accept_invite(repeat('7',64))$$, 'PT409', 'invite_conflict', 'someone who is already a member gets a conflict');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated","email":"y@example.test"}', true);
reset role;
insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-0000000000a6', 'y@example.test', repeat('6',64));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated","email":"y@example.test"}', true);
select throws_ok($$select public.accept_invite(repeat('6',64))$$, 'PT409', 'invite_conflict', 'someone who has members of their own gets a conflict');

-- success
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","email":"J@Example.test"}', true);
select is(public.accept_invite(repeat('b',64)), '00000000-0000-0000-0000-0000000000a1'::uuid, 'the right person accepts and gets the owner id (email compared case-insensitively)');
select is((select account_type from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 'member', 'accepting makes the account a member');
select throws_ok($$select public.accept_invite(repeat('b',64))$$, 'PT404', 'invite_unusable', 'the same link cannot be used twice');
select is(public.list_members() -> 'role', '"member"'::jsonb, 'list_members tells a member they are a member');
select is(public.list_members() -> 'owner' ->> 'name', 'Olive', 'list_members returns the owner');
select throws_ok($$select public.create_invite('z2@example.test', repeat('a',64))$$, 'PT403', 'not_allowed', 'the new member cannot invite');

-- joiner with no profile row yet gets one
reset role;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'np@example.test', now());
insert into public.invites (owner_id, email, token_hash) values ('00000000-0000-0000-0000-0000000000a3', 'np@example.test', repeat('a',64));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","email":"np@example.test"}', true);
select is(public.accept_invite(repeat('a',64)), '00000000-0000-0000-0000-0000000000a3'::uuid, 'a joiner with no profile row can accept');
select is((select account_type from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'member', 'their profile was created as member');

-- ===== list_members (owner / stranger), revoke_invite, remove_member =====
reset role;
select set_config('t.oid', (select id::text from public.invites where owner_id = '00000000-0000-0000-0000-0000000000a1' and revoked_at is null and accepted_at is null limit 1), false);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"o@example.test"}', true);
select is(public.list_members() ->> 'role', 'owner', 'owner shape');
select is(jsonb_array_length(public.list_members() -> 'members'), 2, 'owner sees both members');
select ok(public.list_members() -> 'members' @> '[{"name":"Jo","email":"j@example.test"}]'::jsonb, 'members carry name and email');
select ok(public.list_members()::text !~ 'token_hash|[0-9a-f]{64}', 'list_members never exposes a token hash');
select is((select count(*)::int from jsonb_array_elements(public.list_members() -> 'invites') i where i ->> 'email' in ('old@example.test','new@example.test')), 2, 'open invites listed');
select is((select count(*)::int from jsonb_array_elements(public.list_members() -> 'invites') i where i ->> 'email' in ('used@example.test','revoked@example.test','j@example.test')), 0, 'used, revoked and accepted invites are not listed');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","email":"s@example.test"}', true);
select is(jsonb_array_length(public.list_members() -> 'members'), 1, 'another owner sees only their own members');

-- revoke_invite: own open invite only
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","email":"s@example.test"}', true);
select throws_ok($$select public.revoke_invite(current_setting('t.oid')::uuid)$$, 'PT404', 'not_found', 'cannot revoke another owner''s invite');
select throws_ok($$select public.revoke_invite(gen_random_uuid())$$, 'PT404', 'not_found', 'revoking an unknown invite is not found');
select lives_ok($$select public.revoke_invite(
  (select id from public.invites where owner_id = auth.uid() and email = 'z@example.test'))$$, 'owner can revoke their open invite');
select throws_ok($$select public.revoke_invite((select id from public.invites where owner_id = auth.uid() and email = 'z@example.test'))$$,
  'PT404', 'not_found', 'revoking twice is not found');
select is(pg_temp.err($$select public.accept_invite(repeat('5',64))$$), 'PT404|invite_unusable|', 'a revoked link is unusable');

-- remove_member: own members only; account goes back to owner via the trigger
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"o@example.test"}', true);
select throws_ok($$select public.remove_member('00000000-0000-0000-0000-0000000000b1')$$, 'PT404', 'not_found', 'cannot remove another owner''s member');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","email":"j@example.test"}', true);
select throws_ok($$select public.remove_member('00000000-0000-0000-0000-0000000000a2')$$, 'PT404', 'not_found', 'a member cannot remove themselves or others');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"o@example.test"}', true);
select lives_ok($$select public.remove_member('00000000-0000-0000-0000-0000000000a2')$$, 'owner removes their member');
reset role;
select is((select account_type from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 'owner', 'the removed person is an owner again');
select is((select count(*)::int from public.memberships where member_id = '00000000-0000-0000-0000-0000000000a2'), 0, 'the membership row is gone');

select * from finish();
rollback;
