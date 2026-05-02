-- Show past sessions on the global leaderboard so a streamer's run is visible
-- (with survival time) after they disconnect. Earlier policies hid is_active=false
-- rows, so the leaderboard could only display currently-live streamers.

drop policy if exists "sessions_select_leaderboard_public" on public.sessions;
create policy "sessions_select_leaderboard_public"
on public.sessions
for select
to anon, authenticated
using (true);

drop policy if exists "profiles_select_for_active_streamers" on public.profiles;
create policy "profiles_select_for_active_streamers"
on public.profiles
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.user_id = profiles.id
  )
);
