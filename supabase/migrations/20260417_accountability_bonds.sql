-- Accountability Bonds + Stripe-ready fields

alter table public.profiles
add column if not exists is_pro boolean not null default false,
add column if not exists armor_level integer not null default 0 check (armor_level >= 0 and armor_level <= 5);

alter table public.sessions
add column if not exists bounty_pool integer not null default 0 check (bounty_pool >= 0);

create table if not exists public.bounty_tips (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  viewer_id text not null check (char_length(viewer_id) >= 8),
  amount integer not null default 100 check (amount = 100),
  created_at timestamptz not null default now()
);

create index if not exists bounty_tips_session_idx
  on public.bounty_tips(session_id, created_at desc);

alter table public.bounty_tips enable row level security;

drop policy if exists "bounty_tips_read_all" on public.bounty_tips;
create policy "bounty_tips_read_all"
on public.bounty_tips
for select
to anon, authenticated
using (true);

drop policy if exists "bounty_tips_insert_all" on public.bounty_tips;
create policy "bounty_tips_insert_all"
on public.bounty_tips
for insert
to anon, authenticated
with check (true);

create or replace function public.tip_bounty(
  p_session_id uuid,
  p_viewer_id text
)
returns table (
  bounty_pool integer,
  can_cash_out boolean,
  minutes_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_time timestamptz;
  v_current_health integer;
  v_pool integer;
  v_elapsed_minutes integer;
  v_minutes_remaining integer;
begin
  if p_viewer_id is null or char_length(trim(p_viewer_id)) < 8 then
    raise exception 'viewer_id must be a stable identifier with at least 8 chars';
  end if;

  select s.start_time, s.current_health, s.bounty_pool
  into v_start_time, v_current_health, v_pool
  from public.sessions s
  where s.id = p_session_id
  for update;

  if v_start_time is null then
    raise exception 'session not found';
  end if;

  insert into public.bounty_tips (session_id, viewer_id, amount)
  values (p_session_id, trim(p_viewer_id), 100);

  update public.sessions
  set bounty_pool = bounty_pool + 100
  where id = p_session_id
  returning public.sessions.bounty_pool into v_pool;

  v_elapsed_minutes := floor(extract(epoch from (now() - v_start_time)) / 60.0);
  v_minutes_remaining := greatest(0, 90 - v_elapsed_minutes);

  return query
  select
    v_pool,
    (v_current_health > 0 and v_elapsed_minutes >= 90),
    v_minutes_remaining;
end;
$$;

revoke all on function public.tip_bounty(uuid, text) from public;
grant execute on function public.tip_bounty(uuid, text) to anon, authenticated;
