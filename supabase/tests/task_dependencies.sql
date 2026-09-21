begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare
  ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350';
  area uuid;
  predecessor uuid;
  dependent uuid;
  rejected boolean;
begin
  select id into strict area
  from public.mkt_work_areas
  where workspace_id = ws and deleted_at is null
  order by sort_order, created_at
  limit 1;

  insert into public.mkt_tasks (workspace_id, area_id, title, source_type, status)
  values (ws, area, '선행 업무 회귀 테스트', 'self', 'planned')
  returning id into predecessor;

  insert into public.mkt_tasks (workspace_id, area_id, title, source_type, status, depends_on_task_id)
  values (ws, area, '후속 업무 회귀 테스트', 'self', 'planned', predecessor)
  returning id into dependent;

  if (select depends_on_task_id from public.mkt_tasks where id = dependent) <> predecessor then
    raise exception 'task dependency was not stored';
  end if;

  rejected := false;
  begin
    update public.mkt_tasks set depends_on_task_id = id where id = dependent;
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'self dependency accepted'; end if;
end $$;
rollback;
