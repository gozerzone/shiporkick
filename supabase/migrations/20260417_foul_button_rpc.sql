-- Foul voting + anti-spam RPC

create table if not exists public.foul_events (
  session_id uuid not null references public.sessions(id) on delete cascade,
  viewer_id text not null check (char_length(viewer_id) >= 8),
  last_foul_at timestamptz not null default now(),
  primary key (session_id, viewer_id)
);

create index if not exists foul_events_session_time_idx
  on public.foul_events(session_id, last_foul_at desc);

alter table public.foul_events enable row level security;

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
  v_window_start timestamptz := v_now - interval '2 minutes';
  v_unique_count integer := 0;
  v_current_health integer := 0;
  v_applied boolean := false;
begin
  if p_viewer_id is null or char_length(trim(p_viewer_id)) < 8 then
    raise exception 'viewer_id must be a stable identifier with at least 8 chars';
  end if;

  if not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'session not found';
  end if;

  insert into public.foul_events (session_id, viewer_id, last_foul_at)
  values (p_session_id, trim(p_viewer_id), v_now)
  on conflict (session_id, viewer_id)
  do update set last_foul_at = excluded.last_foul_at;

  select count(*)
  into v_unique_count
  from public.foul_events
  where session_id = p_session_id
    and last_foul_at >= v_window_start;

  if v_unique_count >= 5 then
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
    greatest(0, 5 - v_unique_count);
end;
$$;

revoke all on function public.submit_foul(uuid, text) from public;
grant execute on function public.submit_foul(uuid, text) to anon, authenticated;
