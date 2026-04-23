-- Streamer-to-streamer messages.
-- Note: auth is still in local/browser mode for now, so policies are permissive.
-- The frontend enforces: account mode + at least 1 XP before send is enabled.

create table if not exists public.streamer_messages (
  id uuid primary key default gen_random_uuid(),
  sender_handle text not null check (char_length(trim(sender_handle)) >= 3),
  recipient_handle text not null check (char_length(trim(recipient_handle)) >= 3),
  sender_display_name text not null default 'UNKNOWN',
  recipient_display_name text not null default 'UNKNOWN',
  sender_xp integer not null default 0 check (sender_xp >= 0),
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists streamer_messages_recipient_created_idx
  on public.streamer_messages(recipient_handle, created_at desc);

create index if not exists streamer_messages_sender_created_idx
  on public.streamer_messages(sender_handle, created_at desc);

alter table public.streamer_messages enable row level security;

drop policy if exists "streamer_messages_read_all" on public.streamer_messages;
create policy "streamer_messages_read_all"
on public.streamer_messages
for select
to anon, authenticated
using (true);

drop policy if exists "streamer_messages_insert_all" on public.streamer_messages;
create policy "streamer_messages_insert_all"
on public.streamer_messages
for insert
to anon, authenticated
with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'streamer_messages'
  ) then
    alter publication supabase_realtime add table public.streamer_messages;
  end if;
end $$;

alter table public.streamer_messages replica identity full;
