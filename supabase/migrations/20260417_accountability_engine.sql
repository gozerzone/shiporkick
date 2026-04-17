-- Accountability Engine schema + Realtime setup

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  level integer not null default 1 check (level >= 1),
  xp integer not null default 0 check (xp >= 0),
  kick_count integer not null default 0 check (kick_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_time timestamptz not null default now(),
  current_health integer not null default 100 check (current_health >= 0 and current_health <= 100),
  task_description text not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_start_time_idx on public.sessions(start_time desc);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

-- Basic owner access policies. Adjust if you use service-role-only writes.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
on public.sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
on public.sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
on public.sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Realtime: stream updates for session health changes.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;
alter table public.sessions replica identity full;
