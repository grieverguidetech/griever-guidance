-- One profile row per Supabase Auth user. Holds app state only: no contacts and
-- no message content (C2, C3, C4). Email lives in auth.users, not here.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  sender_name text check (char_length(sender_name) <= 100),
  contact_source text check (contact_source in ('import', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Explicit, column-level grants: id and created_at can never be changed by a client.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, sender_name, contact_source) on table public.profiles to authenticated;
grant update (sender_name, contact_source) on table public.profiles to authenticated;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy on purpose (C9): rows go only when the auth user is deleted (cascade).

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
