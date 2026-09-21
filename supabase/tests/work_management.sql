begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare
  ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350';
  area uuid;
  project uuid;
  task uuid;
  rejected boolean;
begin
  select id into strict area
  from public.mkt_work_areas
  where workspace_id = ws and deleted_at is null
  order by sort_order, created_at
  limit 1;

  insert into public.mkt_work_projects (workspace_id, area_id, name, start_on, due_on)
  values (ws, area, '업무 관리 회귀 테스트', '2026-09-21', '2026-09-30')
  returning id into project;

  insert into public.mkt_tasks (workspace_id, area_id, project_id, title, source_type, status, start_at, due_at)
  values (ws, area, project, '오늘의 테스트 업무', 'self', 'planned', '2026-09-21T12:00:00+09:00', '2026-09-22T23:59:00+09:00')
  returning id into task;

  if not exists (
    select 1 from public.mkt_tasks
    where id = task and workspace_id = ws and project_id = project
  ) then raise exception 'task was not stored under the workspace project'; end if;

  update public.mkt_tasks
  set status = 'done', completed_at = timezone('utc', now())
  where id = task;
  if (select status from public.mkt_tasks where id = task) <> 'done' then
    raise exception 'task completion was not saved';
  end if;

  rejected := false;
  begin
    insert into public.mkt_tasks (workspace_id, area_id, title, source_type, status)
    values (ws, area, '요청자 없는 업무', 'requested', 'requested');
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'requested task without requester accepted'; end if;

  rejected := false;
  begin
    update public.mkt_tasks set status = 'done', completed_at = null where id = task;
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'done task without completion timestamp accepted'; end if;
end $$;
rollback;
