-- Add vouch tracking to active sessions

alter table public.sessions
add column if not exists vouch_count integer not null default 0 check (vouch_count >= 0);
