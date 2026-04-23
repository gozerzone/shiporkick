-- Auto session lifecycle for streamer start/stop events.
-- This keeps leaderboard rows in sync without manual SQL inserts.

alter table public.sessions
add column if not exists is_active boolean not null default true,
add column if not exists ended_at timestamptz;

create index if not exists sessions_is_active_start_idx
  on public.sessions(is_active, start_time desc);

drop policy if exists "sessions_select_leaderboard_public" on public.sessions;
create policy "sessions_select_leaderboard_public"
on public.sessions
for select
to anon, authenticated
using (is_active = true and current_health > 0);

create or replace function public.start_stream_session(
  p_username text,
  p_task_description text,
  p_work_category text default 'General / Other'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := trim(coalesce(p_username, ''));
  v_task text := trim(coalesce(p_task_description, ''));
  v_category text := trim(coalesce(p_work_category, ''));
  v_profile_id uuid;
  v_session_id uuid;
begin
  if char_length(v_username) < 3 then
    raise exception 'username must be at least 3 chars';
  end if;
  if char_length(v_task) < 3 then
    raise exception 'task description must be at least 3 chars';
  end if;
  if v_category = '' then
    v_category := 'General / Other';
  end if;

  insert into public.profiles (username)
  values (v_username)
  on conflict (username) do nothing;

  select p.id into v_profile_id
  from public.profiles p
  where p.username = v_username
  limit 1;

  if v_profile_id is null then
    raise exception 'profile lookup failed for username %', v_username;
  end if;

  update public.sessions
  set is_active = false,
      ended_at = now()
  where user_id = v_profile_id
    and is_active = true;

  insert into public.sessions (
    user_id,
    task_description,
    current_health,
    vouch_count,
    bounty_pool,
    work_category,
    is_active,
    start_time,
    ended_at
  )
  values (
    v_profile_id,
    v_task,
    100,
    0,
    0,
    v_category,
    true,
    now(),
    null
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.stop_stream_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null then
    return;
  end if;

  update public.sessions
  set is_active = false,
      ended_at = now()
  where id = p_session_id;
end;
$$;

revoke all on function public.start_stream_session(text, text, text) from public;
grant execute on function public.start_stream_session(text, text, text) to anon, authenticated;

revoke all on function public.stop_stream_session(uuid) from public;
grant execute on function public.stop_stream_session(uuid) to anon, authenticated;
