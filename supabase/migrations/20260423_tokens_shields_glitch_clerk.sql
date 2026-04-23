-- Foundation: token balances, deep-work shield (blocks kicks), HUD glitch pulses,
-- Clerk profile link, sessions.glitch_until. Client uses explicit public schema + RPCs.

-- ---------------------------------------------------------------------------
-- profiles: Clerk external id + shield window
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists clerk_user_id text;

create unique index if not exists profiles_clerk_user_id_uidx
  on public.profiles (clerk_user_id)
  where clerk_user_id is not null;

alter table public.profiles
  add column if not exists shield_until timestamptz;

-- ---------------------------------------------------------------------------
-- sessions: short glitch pulse for HUD (kick tokens from peers)
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists glitch_until timestamptz;

-- ---------------------------------------------------------------------------
-- public.tokens: per-profile balances (no direct anon access; use RPCs)
-- ---------------------------------------------------------------------------
create table if not exists public.tokens (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  kick_tokens integer not null default 5 check (kick_tokens >= 0),
  block_kick_tokens integer not null default 2 check (block_kick_tokens >= 0),
  vouch_power_tokens integer not null default 5 check (vouch_power_tokens >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists tokens_profile_idx on public.tokens (profile_id);

alter table public.tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Ensure a tokens row exists whenever a profile is created
-- ---------------------------------------------------------------------------
create or replace function public.tokens_profile_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tokens (profile_id) values (new.id) on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tokens_profile_after_insert on public.profiles;
create trigger tokens_profile_after_insert
after insert on public.profiles
for each row execute function public.tokens_profile_bootstrap();

insert into public.tokens (profile_id)
select p.id from public.profiles p
where not exists (select 1 from public.tokens t where t.profile_id = p.id)
on conflict (profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- resolve_profile_id_for_clerk: map Clerk user id to profile uuid
-- ---------------------------------------------------------------------------
create or replace function public.resolve_profile_id_for_clerk(p_clerk_user_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clerk text := nullif(trim(coalesce(p_clerk_user_id, '')), '');
  v_id uuid;
begin
  if v_clerk is null then
    return null;
  end if;
  select id into v_id from public.profiles where clerk_user_id = v_clerk limit 1;
  return v_id;
end;
$$;

revoke all on function public.resolve_profile_id_for_clerk(text) from public;
grant execute on function public.resolve_profile_id_for_clerk(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- link_clerk_profile: attach Clerk id to username (creates profile if needed)
-- ---------------------------------------------------------------------------
create or replace function public.link_clerk_profile(p_clerk_user_id text, p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clerk text := nullif(trim(coalesce(p_clerk_user_id, '')), '');
  v_username text := trim(lower(regexp_replace(coalesce(p_username, ''), '[^a-z0-9_-]+', '-', 'g')));
  v_id uuid;
begin
  if v_clerk is null or char_length(v_clerk) < 3 then
    raise exception 'clerk_user_id required';
  end if;
  if char_length(v_username) < 3 then
    raise exception 'username must be at least 3 chars';
  end if;

  select id into v_id from public.profiles where clerk_user_id = v_clerk limit 1;
  if v_id is not null then
    update public.profiles set username = v_username where id = v_id;
    return v_id;
  end if;

  update public.profiles
  set clerk_user_id = v_clerk
  where username = v_username and clerk_user_id is null
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  if exists (select 1 from public.profiles where username = v_username) then
    raise exception 'username already taken by another profile';
  end if;

  insert into public.profiles (username, clerk_user_id)
  values (v_username, v_clerk)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.link_clerk_profile(text, text) from public;
grant execute on function public.link_clerk_profile(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_token_balances
-- ---------------------------------------------------------------------------
create or replace function public.get_token_balances(p_clerk_user_id text)
returns table (
  kick_tokens integer,
  block_kick_tokens integer,
  vouch_power_tokens integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
begin
  v_pid := public.resolve_profile_id_for_clerk(p_clerk_user_id);
  if v_pid is null then
    return query select 0, 0, 0;
    return;
  end if;
  insert into public.tokens (profile_id) values (v_pid) on conflict (profile_id) do nothing;
  return query
  select t.kick_tokens, t.block_kick_tokens, t.vouch_power_tokens
  from public.tokens t
  where t.profile_id = v_pid;
end;
$$;

revoke all on function public.get_token_balances(text) from public;
grant execute on function public.get_token_balances(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- spend_kick_glitch: consume kick token, set target session glitch window
-- ---------------------------------------------------------------------------
create or replace function public.spend_kick_glitch(p_actor_clerk_id text, p_target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_target_profile uuid;
  v_shield timestamptz;
  v_rows int;
begin
  v_actor := public.resolve_profile_id_for_clerk(p_actor_clerk_id);
  if v_actor is null then
    raise exception 'sign in required for kick tokens';
  end if;

  select s.user_id into v_target_profile
  from public.sessions s
  where s.id = p_target_session_id and s.is_active = true and s.current_health > 0
  limit 1;

  if v_target_profile is null then
    raise exception 'target session not active';
  end if;

  if v_target_profile = v_actor then
    raise exception 'cannot glitch your own session';
  end if;

  select p.shield_until into v_shield
  from public.profiles p
  where p.id = v_target_profile;

  if v_shield is not null and v_shield > now() then
    raise exception 'target is in deep work — kick/glitch blocked';
  end if;

  insert into public.tokens (profile_id) values (v_actor) on conflict (profile_id) do nothing;

  update public.tokens
  set kick_tokens = kick_tokens - 1,
      updated_at = now()
  where profile_id = v_actor and kick_tokens > 0;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'not enough kick tokens';
  end if;

  update public.sessions
  set glitch_until = now() + interval '8 seconds'
  where id = p_target_session_id;
end;
$$;

revoke all on function public.spend_kick_glitch(text, uuid) from public;
grant execute on function public.spend_kick_glitch(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- spend_vouch_power: token + session vouch_count + profile XP bump
-- ---------------------------------------------------------------------------
create or replace function public.spend_vouch_power(p_actor_clerk_id text, p_target_session_id uuid)
returns table (new_vouch_count integer, target_xp integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_target_profile uuid;
  v_vc int;
  v_xp int;
  v_rows int;
begin
  v_actor := public.resolve_profile_id_for_clerk(p_actor_clerk_id);
  if v_actor is null then
    raise exception 'sign in required for vouch power';
  end if;

  select s.user_id into v_target_profile
  from public.sessions s
  where s.id = p_target_session_id and s.is_active = true and s.current_health > 0
  limit 1;

  if v_target_profile is null then
    raise exception 'target session not active';
  end if;

  if v_target_profile = v_actor then
    raise exception 'cannot vouch your own row';
  end if;

  insert into public.tokens (profile_id) values (v_actor) on conflict (profile_id) do nothing;

  update public.tokens
  set vouch_power_tokens = vouch_power_tokens - 1,
      updated_at = now()
  where profile_id = v_actor and vouch_power_tokens > 0;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'not enough vouch power tokens';
  end if;

  update public.sessions
  set vouch_count = vouch_count + 1
  where id = p_target_session_id
  returning vouch_count into v_vc;

  update public.profiles
  set xp = least(500000, xp + 10)
  where id = v_target_profile
  returning xp into v_xp;

  return query select v_vc, v_xp;
end;
$$;

revoke all on function public.spend_vouch_power(text, uuid) from public;
grant execute on function public.spend_vouch_power(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- activate_deep_work_shield: spend block-kick token, 60 minute shield
-- ---------------------------------------------------------------------------
create or replace function public.activate_deep_work_shield(p_actor_clerk_id text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_until timestamptz;
  v_existing timestamptz;
  v_rows int;
begin
  v_actor := public.resolve_profile_id_for_clerk(p_actor_clerk_id);
  if v_actor is null then
    raise exception 'sign in required for shield';
  end if;

  insert into public.tokens (profile_id) values (v_actor) on conflict (profile_id) do nothing;

  update public.tokens
  set block_kick_tokens = block_kick_tokens - 1,
      updated_at = now()
  where profile_id = v_actor and block_kick_tokens > 0;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'not enough block-kick (shield) tokens';
  end if;

  select shield_until into v_existing from public.profiles where id = v_actor for update;

  if v_existing is not null and v_existing > now() then
    v_until := v_existing + interval '60 minutes';
  else
    v_until := now() + interval '60 minutes';
  end if;

  update public.profiles
  set shield_until = v_until
  where id = v_actor;

  return v_until;
end;
$$;

revoke all on function public.activate_deep_work_shield(text) from public;
grant execute on function public.activate_deep_work_shield(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_foul: respect deep work shield on target streamer
-- ---------------------------------------------------------------------------
create or replace function public.submit_foul(
  p_session_id uuid,
  p_viewer_id text
)
returns table (
  applied boolean,
  current_health integer,
  unique_fouls integer,
  needed_fouls integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - interval '1 hour';
  v_unique_count integer := 0;
  v_current_health integer := 0;
  v_applied boolean := false;
  v_shield timestamptz;
begin
  if p_viewer_id is null or char_length(trim(p_viewer_id)) < 8 then
    raise exception 'viewer_id must be a stable identifier with at least 8 chars';
  end if;

  if not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'session not found';
  end if;

  select p.shield_until into v_shield
  from public.sessions s
  join public.profiles p on p.id = s.user_id
  where s.id = p_session_id;

  if v_shield is not null and v_shield > v_now then
    raise exception 'deep work shield active — kicks disabled for this streamer';
  end if;

  insert into public.foul_events (session_id, viewer_id, last_foul_at)
  values (p_session_id, trim(p_viewer_id), v_now)
  on conflict (session_id, viewer_id)
  do update set
    last_foul_at = case
      when public.foul_events.last_foul_at < v_window_start then excluded.last_foul_at
      else public.foul_events.last_foul_at
    end;

  select count(*)
  into v_unique_count
  from public.foul_events
  where session_id = p_session_id
    and last_foul_at >= v_window_start;

  if v_unique_count >= 3 then
    update public.sessions
    set current_health = greatest(0, current_health - 20)
    where id = p_session_id
    returning public.sessions.current_health into v_current_health;

    delete from public.foul_events
    where session_id = p_session_id
      and last_foul_at >= v_window_start;

    v_applied := true;
    v_unique_count := 0;
  else
    select s.current_health into v_current_health
    from public.sessions s
    where s.id = p_session_id;
  end if;

  return query
  select
    v_applied,
    v_current_health,
    v_unique_count,
    greatest(0, 3 - v_unique_count);
end;
$$;

revoke all on function public.submit_foul(uuid, text) from public;
grant execute on function public.submit_foul(uuid, text) to anon, authenticated;

-- Realtime: glitch_until updates for HUD subscribers
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;
