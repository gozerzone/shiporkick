-- Global leaderboard uses the Supabase anon key from the browser. Base migrations only
-- allowed authenticated users to read their own sessions/profiles, so the leaderboard
-- query returned nothing or failed once tables existed. This adds public read paths
-- for active sessions and the profiles needed for the join.

drop policy if exists "sessions_select_leaderboard_public" on public.sessions;
create policy "sessions_select_leaderboard_public"
on public.sessions
for select
to anon, authenticated
using (current_health > 0);

drop policy if exists "profiles_select_for_active_streamers" on public.profiles;
create policy "profiles_select_for_active_streamers"
on public.profiles
for select
to anon
using (
  exists (
    select 1
    from public.sessions s
    where s.user_id = profiles.id
      and s.current_health > 0
  )
);

-- Realtime: leaderboard subscribes to profiles changes too.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
