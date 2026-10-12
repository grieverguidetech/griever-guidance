-- Invite and membership functions (G1, ticket #117). These are the only writers of
-- public.invites and public.memberships (C6, C9). Each runs as definer under the
-- caller's own JWT through PostgREST rpc; there is no service-role key.
--
-- Errors use PostgREST's custom SQLSTATEs (PTnnn), which it turns into HTTP statuses:
--   PT400 invalid input        PT403 not allowed         PT404 not found / unusable invite
--   PT409 conflict             PT429 rate limited
-- accept_invite answers PT404 'invite_unusable' for every token, email, expiry,
-- state and owner failure, so a link cannot be used to probe for accounts or invites.
-- It answers PT409 only after the token checked out, and only about the caller's own state.
-- No error ever carries a constraint or key detail.
--
-- accept_invite also refuses a joiner who owns flows; that rule was added with the
-- flows table in 20261012000000_flows.sql (#130), which replaces the function.

create function public.create_invite(p_email text, p_token_hash text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_allowed' using errcode = 'PT403';
  end if;
  if char_length(v_email) > 254
     or v_email !~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invite' using errcode = 'PT400';
  end if;

  -- A confirmed owner may not have a profile row yet; make one so the lock below works.
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  -- Serialise this owner's invites so the rate limits cannot be raced.
  perform 1 from public.profiles where id = v_uid for update;

  if not exists (select 1 from public.profiles where id = v_uid and account_type = 'owner')
     or exists (select 1 from public.memberships where member_id = v_uid)
     or not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
    raise exception 'not_allowed' using errcode = 'PT403';
  end if;
  if v_email = lower(coalesce(auth.jwt() ->> 'email', ''))
     or exists (select 1 from auth.users where id = v_uid and lower(email) = v_email) then
    raise exception 'invalid_invite' using errcode = 'PT400';
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.member_id
    where m.owner_id = v_uid and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = 'PT409';
  end if;

  -- An expired open invite would block the one-open-invite index, so retire it first.
  update public.invites set revoked_at = now()
  where owner_id = v_uid and email = v_email
    and accepted_at is null and revoked_at is null and expires_at <= now();

  if (select count(*) from public.invites
      where owner_id = v_uid and created_at > now() - interval '24 hours') >= 10
     or (select count(*) from public.invites
         where owner_id = v_uid and accepted_at is null and revoked_at is null
           and expires_at > now()) >= 20 then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;

  if exists (select 1 from public.invites
             where owner_id = v_uid and email = v_email
               and accepted_at is null and revoked_at is null) then
    raise exception 'already_invited' using errcode = 'PT409';
  end if;

  begin
    insert into public.invites (owner_id, email, token_hash)
    values (v_uid, v_email, p_token_hash)
    returning id into v_id;
  exception when unique_violation then
    -- Same hash or a racing duplicate; never echo the key.
    raise exception 'already_invited' using errcode = 'PT409';
  end;
  return v_id;
end;
$$;

create function public.accept_invite(p_token_hash text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_owner uuid;
  v_invite public.invites;
begin
  if v_uid is null or v_email is null or p_token_hash is null then
    raise exception 'invite_unusable' using errcode = 'PT404';
  end if;

  select owner_id into v_owner from public.invites where token_hash = p_token_hash;
  if v_owner is null then
    raise exception 'invite_unusable' using errcode = 'PT404';
  end if;

  begin
    insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
    -- Lock both profiles in id order (no deadlock), then the invite, before any check, so
    -- "joiner has no members" and "owner is not a member" cannot race another accept.
    perform 1 from public.profiles where id in (v_owner, v_uid) order by id for update;
    select * into v_invite from public.invites where token_hash = p_token_hash for update;

    if v_invite.id is null
       or v_invite.email <> v_email
       or v_invite.accepted_at is not null
       or v_invite.revoked_at is not null
       or v_invite.expires_at <= now()
       or v_invite.owner_id = v_uid
       or not exists (select 1 from auth.users
                      where id = v_uid and email_confirmed_at is not null and lower(email) = v_email)
       or not exists (select 1 from public.profiles where id = v_owner and account_type = 'owner')
       or exists (select 1 from public.memberships where member_id = v_owner) then
      raise exception 'invite_unusable' using errcode = 'PT404';
    end if;

    if exists (select 1 from public.memberships where member_id = v_uid or owner_id = v_uid)
       or exists (select 1 from public.profiles where id = v_uid and account_type <> 'owner') then
      raise exception 'invite_conflict' using errcode = 'PT409';
    end if;

    begin
      insert into public.memberships (owner_id, member_id) values (v_owner, v_uid);
    exception when unique_violation then
      raise exception 'invite_unusable' using errcode = 'PT404';
    end;
    update public.invites set accepted_at = now(), accepted_by = v_uid where id = v_invite.id;
    update public.profiles set account_type = 'member' where id = v_uid;
    -- A member cannot invite, so their own open invites are dead; retire them.
    update public.invites set revoked_at = now()
    where owner_id = v_uid and accepted_at is null and revoked_at is null;
  exception
    when sqlstate 'PT409' then
      raise;
    when others then
      -- Deadlocks, FK errors and the like must look like every other accept failure.
      raise exception 'invite_unusable' using errcode = 'PT404';
  end;
  return v_owner;
end;
$$;

create function public.list_members() returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_allowed' using errcode = 'PT403';
  end if;

  select owner_id into v_owner from public.memberships where member_id = v_uid;
  if v_owner is not null then
    return jsonb_build_object(
      'role', 'member',
      'owner', (select jsonb_build_object('id', p.id, 'name', p.sender_name)
                from public.profiles p where p.id = v_owner));
  end if;

  return jsonb_build_object(
    'role', 'owner',
    'members', coalesce((
      -- the email the member accepted with, not whatever their account email is now
      select jsonb_agg(jsonb_build_object('id', m.member_id, 'name', p.sender_name,
                                          'email', coalesce(
                                            (select i.email from public.invites i
                                             where i.accepted_by = m.member_id and i.owner_id = v_uid
                                             order by i.accepted_at desc limit 1),
                                            u.email))
                       order by m.created_at)
      from public.memberships m
      join auth.users u on u.id = m.member_id
      left join public.profiles p on p.id = m.member_id
      where m.owner_id = v_uid), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email,
                                          'createdAt', i.created_at, 'expiresAt', i.expires_at)
                       order by i.created_at)
      from public.invites i
      where i.owner_id = v_uid and i.accepted_at is null and i.revoked_at is null
        and i.expires_at > now()), '[]'::jsonb));
end;
$$;

create function public.revoke_invite(p_invite_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites set revoked_at = now()
  where id = p_invite_id and owner_id = auth.uid()
    and accepted_at is null and revoked_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'PT404';
  end if;
end;
$$;

-- Only deletes the row. The memberships delete trigger (#116) puts the removed person
-- back to account_type 'owner' (PO decision on #117).
create function public.remove_member(p_member_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.memberships where owner_id = auth.uid() and member_id = p_member_id;
  if not found then
    raise exception 'not_found' using errcode = 'PT404';
  end if;
end;
$$;

revoke execute on function public.create_invite(text, text) from public, anon, authenticated, service_role;
revoke execute on function public.accept_invite(text) from public, anon, authenticated, service_role;
revoke execute on function public.list_members() from public, anon, authenticated, service_role;
revoke execute on function public.revoke_invite(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.remove_member(uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_invite(text, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.list_members() to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
