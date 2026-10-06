-- Rohan Marketing: level-test / enrollment student lists and period-independent metrics.
-- New columns are nullable so existing rows and older JSON backups restore unchanged.

-- 1. Metric aggregation scope: null/'period' = only the viewed period,
--    'lifetime' = everything from the first record through the end of the viewed period.
alter table public.mkt_metrics
  add column if not exists aggregation_scope text
    check (aggregation_scope is null or aggregation_scope in ('period', 'lifetime'));

-- 2. Funnel role for level tests (its daily count comes from the student list).
alter table public.mkt_metrics drop constraint if exists mkt_metric_funnel_role;
alter table public.mkt_metrics add constraint mkt_metric_funnel_role check (
  funnel_role is null or (
    scope = 'funnel' and unit = 'count'
    and funnel_role in ('inflows', 'consultations', 'level_tests', 'enrollments')
  )
);

-- 3. Student details on customer records (owner decision 2026-10-06: real names).
alter table public.mkt_customers
  add column if not exists student_name text,
  add column if not exists school text,
  add column if not exists grade text,
  add column if not exists previous_academy text,
  add column if not exists level_test_on date;

-- 4. Save one funnel day's student list and its count in one transaction.
--    p_students: [{id, reference_code, student_name, school, grade, consulted_on,
--                  level_test_on, enrolled_on, previous_academy, monthly_fee, deleted}]
create function public.mkt_save_funnel_students(
  p_workspace uuid,
  p_metric uuid,
  p_date date,
  p_students jsonb
) returns integer
language plpgsql security invoker set search_path='' as $$
declare role text; s jsonb; total integer;
begin
 if not private.is_workspace_member(p_workspace) then raise exception '접근 권한이 없습니다.'; end if;
 if jsonb_typeof(p_students) is distinct from 'array' then raise exception '학생 목록을 확인하세요.'; end if;
 select funnel_role into role from public.mkt_metrics
 where id = p_metric and workspace_id = p_workspace and scope = 'funnel' and deleted_at is null;
 if role is null or role not in ('level_tests', 'enrollments') then
  raise exception '레벨테스트 또는 신규 등록 지표에서만 학생 명단을 저장할 수 있습니다.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text, 0));
 for s in select * from jsonb_array_elements(p_students) loop
  if coalesce(trim(s->>'student_name'), '') = '' and not coalesce((s->>'deleted')::boolean, false) then
   raise exception '학생 이름을 입력하세요.';
  end if;
  insert into public.mkt_customers(
   id, workspace_id, reference_code, consulted_on, enrolled_on, level_test_on,
   student_name, school, grade, previous_academy, monthly_fee, confidence, deleted_at)
  values(
   (s->>'id')::uuid, p_workspace, s->>'reference_code', (s->>'consulted_on')::date,
   (s->>'enrolled_on')::date, (s->>'level_test_on')::date,
   nullif(trim(s->>'student_name'), ''), nullif(trim(s->>'school'), ''), nullif(trim(s->>'grade'), ''),
   nullif(trim(s->>'previous_academy'), ''), (s->>'monthly_fee')::numeric, 'unknown',
   case when coalesce((s->>'deleted')::boolean, false) then now() end)
  on conflict (id) do update set
   consulted_on = excluded.consulted_on,
   enrolled_on = excluded.enrolled_on,
   level_test_on = excluded.level_test_on,
   student_name = excluded.student_name,
   school = excluded.school,
   grade = excluded.grade,
   previous_academy = excluded.previous_academy,
   monthly_fee = excluded.monthly_fee,
   deleted_at = excluded.deleted_at
  where mkt_customers.workspace_id = p_workspace;
  if not found then raise exception '학생 기록의 작업공간이 다릅니다.'; end if;
 end loop;
 select count(*) into total from public.mkt_customers
 where workspace_id = p_workspace and deleted_at is null
   and case when role = 'level_tests' then level_test_on = p_date else enrolled_on = p_date end;
 perform public.mkt_save_cells(p_workspace, jsonb_build_array(jsonb_build_object(
  'kind', 'metric', 'metric_id', p_metric, 'content_id', null, 'promotion_id', null,
  'date', p_date, 'value', case when total > 0 then total end)));
 return total;
end $$;
revoke all on function public.mkt_save_funnel_students(uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.mkt_save_funnel_students(uuid, uuid, date, jsonb) to authenticated;

-- 5. Owner decisions 2026-10-06.
update public.mkt_metrics set funnel_role = 'level_tests'
where scope = 'funnel' and unit = 'count' and name = '레벨테스트' and funnel_role is null and deleted_at is null;
update public.mkt_metrics set aggregation_scope = 'lifetime'
where key in ('bizProfileRegulars', 'bizProfileCoupons') and deleted_at is null;

notify pgrst, 'reload schema';
