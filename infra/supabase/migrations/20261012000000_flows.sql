-- Shared people (G1, ticket #130): one flows row per person, shared by an owner and
-- that owner's members. Holds exactly six person fields (C2). No draft, contact,
-- recipient, message or wording column, now or later (C2, C3).
-- The id is made on the device (a uuid), so a flow exists offline before it syncs (C5).

create table public.flows (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_name text not null default '' check (char_length(person_name) <= 200),
  date_of_passing text check (char_length(date_of_passing) <= 100),
  service_date text check (char_length(service_date) <= 100),
  obituary_url text check (char_length(obituary_url) <= 2048),
  obituary_publisher text check (char_length(obituary_publisher) <= 200),
  service_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  -- Soft delete only; nobody can delete rows (C9).
  deleted_at timestamptz
);

create index flows_owner_id_idx on public.flows (owner_id);
create index flows_updated_by_idx on public.flows (updated_by);

alter table public.flows enable row level security;

-- Stamps who changed a row and when. Clients cannot write these columns (no grant).
create function public.flows_set_audit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger flows_set_audit
  before insert or update on public.flows
  for each row execute function public.flows_set_audit();

-- Is the caller this owner, or one of this owner's members? Definer so it reads
-- memberships the same way for every caller. The RLS policies call it as the caller,
-- so authenticated must be able to execute it; anon must not.
create function public.can_access_owner(p_owner uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner is not null and auth.uid() is not null and (
    p_owner = auth.uid()
    or exists (select 1 from public.memberships
               where owner_id = p_owner and member_id = auth.uid())
  );
$$;

revoke execute on function public.can_access_owner(uuid) from public, anon, authenticated, service_role;
grant execute on function public.can_access_owner(uuid) to authenticated;

-- Column-level grants. Insert omits owner_id (it defaults to the caller), created_at,
-- updated_at and updated_by. Update omits id, owner_id and created_at. No delete (C9).
revoke all on table public.flows from anon, authenticated;
grant select on table public.flows to authenticated;
grant insert (id, person_name, date_of_passing, service_date, obituary_url,
              obituary_publisher, service_ready, deleted_at)
  on table public.flows to authenticated;
grant update (person_name, date_of_passing, service_date, obituary_url,
              obituary_publisher, service_ready, deleted_at)
  on table public.flows to authenticated;

create policy "flows_select_owner_or_member" on public.flows
  for select to authenticated
  using (public.can_access_owner(owner_id));

create policy "flows_update_owner_or_member" on public.flows
  for update to authenticated
  using (public.can_access_owner(owner_id))
  with check (public.can_access_owner(owner_id));

-- C11 in the database: members cannot create people. A caller counts as a member if
-- they have a membership row OR their profile says account_type 'member'; either is
-- enough to refuse (belt and braces, since accept_invite sets both together).
create policy "flows_insert_owner_not_member" on public.flows
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and not exists (select 1 from public.memberships where member_id = (select auth.uid()))
    and not exists (select 1 from public.profiles
                    where id = (select auth.uid()) and account_type = 'member')
  );

-- No delete policy on purpose (C9).

-- accept_invite, replaced to add one rule: a joiner who owns any flows gets PT409
-- invite_conflict (carried over from #117). Everything else is unchanged.
create or replace function public.accept_invite(p_token_hash text) returns uuid
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
       or exists (select 1 from public.profiles where id = v_uid and account_type <> 'owner')
       -- #130: their own people (including soft-deleted ones) would be orphaned by joining
       or exists (select 1 from public.flows where owner_id = v_uid) then
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

revoke execute on function public.accept_invite(text) from public, anon, authenticated, service_role;
grant execute on function public.accept_invite(text) to authenticated;
