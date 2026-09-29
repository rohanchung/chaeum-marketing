begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare
  ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350';
  area uuid;
  task uuid;
  rejected boolean := false;
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

  -- Completing a later occurrence keeps the earlier missed one as the next open date.
  perform public.mkt_set_task_occurrence(ws, task, '2026-09-22', true, '2026-09-21');
  if not exists (
    select 1 from public.mkt_task_occurrences
    where workspace_id = ws and task_id = task
      and occurrence_on = '2026-09-22' and status = 'done' and completed_at is not null
  ) then raise exception 'occurrence completion was not saved'; end if;
  if (select recurrence_next_on from public.mkt_tasks where id = task) <> '2026-09-21' then
    raise exception 'next open recurring date was not saved';
  end if;

  -- Undoing reopens the occurrence without deleting its history row.
  perform public.mkt_set_task_occurrence(ws, task, '2026-09-22', false, '2026-09-21');
  if (select status from public.mkt_task_occurrences
      where task_id = task and occurrence_on = '2026-09-22') <> 'planned' then
    raise exception 'occurrence undo was not saved';
  end if;

  -- A finished series is marked done and inactive in the same call.
  perform public.mkt_set_task_occurrence(ws, task, '2026-09-21', true, null);
  if not exists (
    select 1 from public.mkt_tasks
    where id = task and status = 'done' and completed_at is not null
      and recurrence_active = false and recurrence_next_on is null
  ) then raise exception 'finished series was not closed'; end if;

  -- Future occurrences cannot be completed in advance.
  begin
    perform public.mkt_set_task_occurrence(ws, task, '2099-01-01', true, null);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'future occurrence was accepted'; end if;
end $$;
rollback;
