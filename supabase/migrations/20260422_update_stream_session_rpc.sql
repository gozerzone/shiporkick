-- Session quest/category sync from the browser uses the anon key; direct UPDATE on
-- public.sessions is blocked by RLS (only authenticated "own row" updates exist).
-- Mirror start/stop_stream_session with a small security definer RPC.

create or replace function public.update_stream_session(
  p_session_id uuid,
  p_task_description text,
  p_work_category text default 'General / Other'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task text := trim(coalesce(p_task_description, ''));
  v_category text := trim(coalesce(p_work_category, ''));
begin
  if p_session_id is null then
    return;
  end if;
  if char_length(v_task) < 3 then
    raise exception 'task description must be at least 3 chars';
  end if;
  if v_category = '' then
    v_category := 'General / Other';
  end if;

  update public.sessions
  set
    task_description = v_task,
    work_category = v_category,
    is_active = true,
    ended_at = null
  where id = p_session_id
    and is_active = true;
end;
$$;

revoke all on function public.update_stream_session(uuid, text, text) from public;
grant execute on function public.update_stream_session(uuid, text, text) to anon, authenticated;
