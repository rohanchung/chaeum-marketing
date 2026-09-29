-- Rohan Marketing: save one recurring-task occurrence and its series pointer atomically.
-- The client computes the earliest open occurrence (p_next_on) from the same
-- recurrence rules it uses for the calendar; null means the series is finished.

create function public.mkt_set_task_occurrence(
  p_workspace uuid,
  p_task uuid,
  p_occurrence_on date,
  p_done boolean,
  p_next_on date
) returns void
language plpgsql security invoker set search_path='' as $$
declare t public.mkt_tasks%rowtype;
begin
 if not private.is_workspace_member(p_workspace) then raise exception '접근 권한이 없습니다.'; end if;
 select * into t from public.mkt_tasks
 where id=p_task and workspace_id=p_workspace and deleted_at is null
 for update;
 if not found then raise exception '반복 업무 원본을 찾지 못했습니다.'; end if;
 if t.recurrence_frequency is null then raise exception '반복 업무가 아닙니다.'; end if;
 if p_done and p_occurrence_on > timezone('Asia/Seoul', now())::date then
  raise exception '미래 회차는 미리 완료할 수 없습니다.';
 end if;

 insert into public.mkt_task_occurrences(workspace_id,task_id,occurrence_on,status,completed_at)
 values(p_workspace,p_task,p_occurrence_on,
  case when p_done then 'done' else 'planned' end,
  case when p_done then now() end)
 on conflict(workspace_id,task_id,occurrence_on) do update
  set status=excluded.status, completed_at=excluded.completed_at;

 update public.mkt_tasks set
  recurrence_next_on=p_next_on,
  recurrence_active=p_next_on is not null,
  status=case
   when p_next_on is null then 'done'
   when t.status='done' then 'planned'
   else t.status end,
  completed_at=case when p_next_on is null then coalesce(t.completed_at, now()) end
 where id=p_task and workspace_id=p_workspace;
end $$;
revoke all on function public.mkt_set_task_occurrence(uuid,uuid,date,boolean,date) from public,anon;
grant execute on function public.mkt_set_task_occurrence(uuid,uuid,date,boolean,date) to authenticated;

notify pgrst,'reload schema';
