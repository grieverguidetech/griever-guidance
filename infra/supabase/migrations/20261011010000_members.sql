-- Family members and invites (G1, ticket #116). Tables and access rules only; the
-- definer functions that write them (create/accept/list/revoke/remove) are #117.
-- Additive: existing profile grants and policies are untouched. No contact, draft,
-- message or deceased-person column anywhere (C2, C3).

-- Account type. Clients can read it (profiles has a table-level select grant) but
-- the insert and update grants are column-level and do not list it, so a client can
-- never set it. New rows get 'owner'; only #117's functions change it.
alter table public.profiles
  add column account_type text not null default 'owner'
  check (account_type in ('owner', 'member'));

-- One owner per member in v1 (unique member_id). Rows are written only by functions.
create table public.memberships (
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);

alter table public.memberships enable row level security;

revoke all on table public.memberships from anon, authenticated;
grant select on table public.memberships to authenticated;

create policy "memberships_select_party" on public.memberships
  for select to authenticated
  using ((select auth.uid()) in (owner_id, member_id));

-- No insert, update or delete grant or policy (C6, C9): functions only.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email = lower(email)),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz
);

-- At most one open (not accepted, not revoked) invite per owner and email.
-- Expiry cannot be in an index predicate, so #117 must revoke expired rows when re-inviting.
create unique index invites_one_open_per_owner_email
  on public.invites (owner_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.invites enable row level security;

-- Column-level select that leaves out token_hash: it is never readable by a client,
-- and `select *` is refused. No insert, update or delete grant (functions only).
revoke all on table public.invites from anon, authenticated;
grant select (id, owner_id, email, created_at, expires_at, accepted_at, accepted_by, revoked_at)
  on table public.invites to authenticated;

create policy "invites_select_owner" on public.invites
  for select to authenticated
  using ((select auth.uid()) = owner_id);
