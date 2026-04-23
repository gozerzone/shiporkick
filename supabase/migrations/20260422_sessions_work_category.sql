-- Top-level work categories for leaderboard filtering.
alter table public.sessions
add column if not exists work_category text not null default 'General / Other';

create index if not exists sessions_work_category_idx on public.sessions(work_category);
