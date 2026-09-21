begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare
  ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350';
  area uuid;
  task uuid;
begin
  select id into strict area
  from public.mkt_work_areas
  where workspace_id = ws and deleted_at is null
  order by sort_order, created_at
  limit 1;

  insert into public.mkt_tasks (
    workspace_id, area_id, title, source_type, status,
    start_at, due_at, recurrence_frequency, recurrence_interval,
    recurrence_weekday, recurrence_next_on, recurrence_active
  ) values (
    ws, area, '반복 업무 회귀 테스트', 'recurring', 'planned',
    '2026-09-21T12:00:00+09:00', '2026-09-21T23:59:00+09:00',
    'daily', 1, 1, '2026-09-21', true
  ) returning id into task;

  insert into public.mkt_task_occurrences (
    workspace_id, task_id, occurrence_on, status
  ) values (ws, task, '2026-09-21', 'planned');

  update public.mkt_task_occurrences
  set status = 'done', completed_at = timezone('utc', now())
  where workspace_id = ws and task_id = task and occurrence_on = '2026-09-21';
  update public.mkt_tasks
  set recurrence_next_on = '2026-09-22'
  where id = task and workspace_id = ws;

  if not exists (
    select 1 from public.mkt_task_occurrences
    where workspace_id = ws and task_id = task
      and occurrence_on = '2026-09-21' and status = 'done'
  ) then raise exception 'occurrence completion was not saved'; end if;

  if (select recurrence_next_on from public.mkt_tasks where id = task) <> '2026-09-22' then
    raise exception 'next recurring date was not saved';
  end if;
end $$;
rollback;
