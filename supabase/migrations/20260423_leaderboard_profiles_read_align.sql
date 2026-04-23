-- Leaderboard join: anon (browser) must read profiles linked to *visible* sessions.
-- Original policy was anon-only and did not mention is_active; nested session RLS
-- usually still hid inactive rows, but this matches the sessions policy explicitly and
-- allows authenticated clients to read the same rows if you ever use a user JWT.

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
      and s.is_active = true
      and s.current_health > 0
  )
);
