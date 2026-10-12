begin;
select plan(51);

-- O owner, M O's member, S stranger, F owner of a flow who is invited by O, N plain owner (no profile row).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'o@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g@example.test', now());

insert into public.profiles (id, sender_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Olive'),
  ('00000000-0000-0000-0000-0000000000c2', 'Max'),
  ('00000000-0000-0000-0000-0000000000c3', 'Sam'),
  ('00000000-0000-0000-0000-0000000000c4', 'Fay'),
  ('00000000-0000-0000-0000-0000000000c6', 'Gus');
-- M is O's member, as accept_invite leaves things.
insert into public.memberships (owner_id, member_id)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
update public.profiles set account_type = 'member' where id = '00000000-0000-0000-0000-0000000000c2';
-- G has a membership row but account_type 'owner'; used to test each half of the C11 check.
-- (second membership owner is S; G is S's member.)
insert into public.memberships (owner_id, member_id)
  values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c6');

insert into public.flows (id, owner_id, person_name) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'Grandma'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c4', 'Uncle Bob');

-- Invites from O for F and for the stranger-owner-less joiners.
insert into public.invites (owner_id, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000c1', 'f@example.test', repeat('a',64)),
  ('00000000-0000-0000-0000-0000000000c1', 'n@example.test', repeat('b',64));

create function pg_temp.err(q text) returns text language plpgsql as $f$
declare s text; m text;
begin
  execute q;
  return 'no error';
exception when others then
  get stacked diagnostics s = returned_sqlstate, m = message_text;
  return s || '|' || m;
end;
$f$;

-- ===== structure (C2, C3) =====
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'flows'
    and column_name ~* 'contact|recipient|draft|message|wording|body'), 0,
  'flows has no contact, recipient, draft or message column');
select is((select array_agg(column_name::text order by column_name) from information_schema.columns
  where table_schema = 'public' and table_name = 'flows'),
  array['created_at','date_of_passing','deleted_at','id','obituary_publisher','obituary_url','owner_id','person_name','service_date','service_ready','updated_at','updated_by'],
  'flows has exactly the agreed columns');
select ok((select relrowsecurity from pg_class where oid = 'public.flows'::regclass), 'row level security is on');

-- ===== privileges =====
select ok(not has_table_privilege('anon', 'public.flows', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'), 'anon has no table privilege on flows');
select ok(not has_table_privilege('authenticated', 'public.flows', 'DELETE, TRUNCATE'), 'authenticated cannot delete or truncate flows');
select ok(not has_column_privilege('authenticated', 'public.flows', 'owner_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.flows', 'id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.flows', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.flows', 'updated_by', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.flows', 'updated_at', 'UPDATE'),
  'owner_id, id, created_at, updated_at and updated_by are not updatable');
select ok(not has_column_privilege('authenticated', 'public.flows', 'deleted_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.flows', 'deleted_at', 'INSERT'),
  'no client can write deleted_at');
select ok(not has_column_privilege('authenticated', 'public.flows', 'owner_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.flows', 'updated_by', 'INSERT')
  and has_column_privilege('authenticated', 'public.flows', 'id', 'INSERT'),
  'insert grant leaves out owner_id and updated_by but includes id');
select ok(not has_function_privilege('anon', 'public.can_access_owner(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.can_access_owner(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.can_access_owner(uuid)', 'execute'),
  'only authenticated can execute can_access_owner');
select ok(exists (select 1 from pg_proc where proname = 'can_access_owner' and prosecdef and proconfig @> array['search_path=""']),
  'can_access_owner is security definer with an empty search_path');
select ok(not has_function_privilege('anon', 'public.accept_invite(text)', 'execute')
  and not has_function_privilege('service_role', 'public.accept_invite(text)', 'execute')
  and has_function_privilege('authenticated', 'public.accept_invite(text)', 'execute'),
  'accept_invite keeps its privileges after being replaced');

-- ===== anon =====
set local role anon;
select throws_ok($$select * from public.flows$$, '42501', null, 'anon cannot read flows');
select throws_ok($$insert into public.flows (id) values (gen_random_uuid())$$, '42501', null, 'anon cannot insert flows');

-- ===== owner =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","email":"o@example.test"}', true);
select is((select count(*)::int from public.flows), 1, 'owner sees only their own flow');
select lives_ok($$insert into public.flows (id, person_name, date_of_passing, service_date, obituary_url, obituary_publisher, service_ready)
  values ('33333333-3333-3333-3333-333333333333', 'Aunt May', '1 Oct', '8 Oct', 'https://example.test/may', 'The Post', true)$$,
  'owner can insert a flow');
select is((select owner_id from public.flows where id = '33333333-3333-3333-3333-333333333333'),
  '00000000-0000-0000-0000-0000000000c1'::uuid, 'owner_id defaults to the caller');
select is((select updated_by from public.flows where id = '33333333-3333-3333-3333-333333333333'),
  '00000000-0000-0000-0000-0000000000c1'::uuid, 'updated_by is set on insert');
select throws_ok($$insert into public.flows (id, owner_id) values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000c3')$$,
  '42501', null, 'owner cannot insert a flow for someone else (owner_id is not grantable)');
select throws_ok($$insert into public.flows (id, person_name) values (gen_random_uuid(), repeat('x', 201))$$,
  '23514', null, 'person_name length is checked');
select throws_ok($$insert into public.flows (id, obituary_url) values (gen_random_uuid(), repeat('x', 2049))$$,
  '23514', null, 'obituary_url length is checked');
select throws_ok($$update public.flows set owner_id = '00000000-0000-0000-0000-0000000000c3' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'owner_id cannot be updated');
select throws_ok($$update public.flows set id = gen_random_uuid() where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'id cannot be updated');
select throws_ok($$update public.flows set created_at = now() where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'created_at cannot be updated');
select throws_ok($$update public.flows set updated_by = null where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'updated_by cannot be written by a client');
select throws_ok($$delete from public.flows$$, '42501', null, 'owner cannot delete');
select throws_ok($$update public.flows set deleted_at = now() where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'owner cannot set deleted_at directly either');

-- ===== member =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","email":"m@example.test"}', true);
select is((select count(*)::int from public.flows), 2, 'member reads all of the owner''s flows and none of anyone else''s');
select lives_ok($$update public.flows set person_name = 'Gran', service_ready = true where id = '11111111-1111-1111-1111-111111111111'$$,
  'member can update the owner''s flow');
select is((select person_name from public.flows where id = '11111111-1111-1111-1111-111111111111'), 'Gran', 'the member''s edit stuck');
select is((select updated_by from public.flows where id = '11111111-1111-1111-1111-111111111111'),
  '00000000-0000-0000-0000-0000000000c2'::uuid, 'updated_by is the member, set by the trigger');
select throws_ok($$insert into public.flows (id, person_name) values (gen_random_uuid(), 'Mine')$$,
  '42501', null, 'a member cannot insert a flow (C11)');
select throws_ok($$delete from public.flows$$, '42501', null, 'member cannot delete');
select throws_ok($$update public.flows set deleted_at = now() where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'a member cannot set deleted_at (C9)');
select is((select count(*)::int from public.flows where owner_id = '00000000-0000-0000-0000-0000000000c2'), 0, 'member owns nothing');

-- membership row alone (account_type still owner) is enough to refuse an insert
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated","email":"g@example.test"}', true);
select throws_ok($$insert into public.flows (id) values (gen_random_uuid())$$, '42501', null,
  'a membership row alone blocks insert even when account_type says owner');
-- account_type alone (no membership row) is enough too
reset role;
delete from public.memberships where member_id = '00000000-0000-0000-0000-0000000000c6';
update public.profiles set account_type = 'member' where id = '00000000-0000-0000-0000-0000000000c6';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated","email":"g@example.test"}', true);
select throws_ok($$insert into public.flows (id) values (gen_random_uuid())$$, '42501', null,
  'account_type member alone blocks insert when there is no membership row');

-- ===== a removed member loses access at once =====
reset role;
delete from public.memberships where member_id = '00000000-0000-0000-0000-0000000000c2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","email":"m@example.test"}', true);
select is((select count(*)::int from public.flows), 0, 'a just-removed member sees 0 flows');
select is(pg_temp.err($$update public.flows set person_name = 'x' where id = '11111111-1111-1111-1111-111111111111'$$), 'no error', 'a just-removed member update is not an error');
reset role;
select is((select person_name from public.flows where id = '11111111-1111-1111-1111-111111111111'), 'Gran', 'and it changed nothing');
select is((select account_type from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'), 'owner', 'the removed member is an owner again');

-- ===== stranger =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated","email":"s@example.test"}', true);
select is((select count(*)::int from public.flows), 0, 'a stranger sees no flows');
select is(pg_temp.err($$update public.flows set person_name = 'x' where id = '11111111-1111-1111-1111-111111111111'$$), 'no error', 'a stranger update is not an error');
select is((select person_name from public.flows where id = '11111111-1111-1111-1111-111111111111'), null, 'a stranger still sees nothing');
reset role;
select is((select person_name from public.flows where id = '11111111-1111-1111-1111-111111111111'), 'Gran', 'and a stranger update changed nothing');

-- a profile-less owner can insert (no profile row, no membership)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated","email":"n@example.test"}', true);
select lives_ok($$insert into public.flows (id, person_name) values (gen_random_uuid(), 'Fresh')$$, 'an owner with no profile row can insert');

-- ===== accept_invite refuses a joiner who owns flows =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated","email":"f@example.test"}', true);
select is(pg_temp.err($$select public.accept_invite(repeat('a',64))$$), 'PT409|invite_conflict', 'a joiner who owns flows gets PT409 invite_conflict');
reset role;
select is((select count(*)::int from public.memberships where member_id = '00000000-0000-0000-0000-0000000000c4'), 0, 'and no membership was made');
-- a soft-deleted flow still counts as owned
update public.flows set deleted_at = now() where id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated","email":"f@example.test"}', true);
select is(pg_temp.err($$select public.accept_invite(repeat('a',64))$$), 'PT409|invite_conflict', 'a soft-deleted flow still blocks joining');
-- an owner with no flows can still join
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated","email":"n@example.test"}', true);
reset role;
delete from public.flows where owner_id = '00000000-0000-0000-0000-0000000000c5';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated","email":"n@example.test"}', true);
select is(public.accept_invite(repeat('b',64)), '00000000-0000-0000-0000-0000000000c1'::uuid, 'an owner with no flows can still join');
-- once joined, that member can see O's flows and cannot insert
select is((select count(*)::int from public.flows), 2, 'the new member sees the owner''s flows');
select throws_ok($$insert into public.flows (id) values (gen_random_uuid())$$, '42501', null, 'the new member cannot insert');

select * from finish();
rollback;
