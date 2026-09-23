begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare
  ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350';
  area uuid;
  task uuid;
  item uuid;
begin
  select id into strict area
  from public.mkt_work_areas
  where workspace_id = ws and deleted_at is null
  order by sort_order, created_at
  limit 1;

  insert into public.mkt_tasks (workspace_id, area_id, title, source_type, status)
  values (ws, area, '체크리스트 회귀 테스트 업무', 'self', 'planned')
  returning id into task;

  insert into public.mkt_task_checklist_items (workspace_id, task_id, title, sort_order)
  values (ws, task, 'PP 도착 확인', 100)
  returning id into item;

  if (select title from public.mkt_task_checklist_items where id = item) <> 'PP 도착 확인' then
    raise exception 'checklist item was not stored';
  end if;

  update public.mkt_task_checklist_items
  set title = 'PP 옮겨 놓기', completed_at = timezone('utc', now())
  where id = item and workspace_id = ws;
  if not exists (
    select 1 from public.mkt_task_checklist_items
    where id = item and title = 'PP 옮겨 놓기' and completed_at is not null
  ) then raise exception 'checklist item completion or edit was not stored'; end if;

  update public.mkt_task_checklist_items
  set deleted_at = timezone('utc', now())
  where id = item and workspace_id = ws;
  if exists (
    select 1 from public.mkt_task_checklist_items
    where id = item and deleted_at is null
  ) then raise exception 'checklist item soft delete was not stored'; end if;
end $$;
rollback;
