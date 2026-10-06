begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350'; lt uuid; en uuid; n int; v numeric; rejected boolean := false;
begin
  select id into strict lt from public.mkt_metrics where workspace_id=ws and funnel_role='level_tests' and deleted_at is null limit 1;
  select id into strict en from public.mkt_metrics where workspace_id=ws and funnel_role='enrollments' and deleted_at is null limit 1;
  -- Two level-test students on one day → the funnel cell becomes 2.
  n := public.mkt_save_funnel_students(ws, lt, '2099-01-05', jsonb_build_array(
    jsonb_build_object('id','00000000-0000-4000-8000-00000000c001','reference_code','TEST-LT-1','student_name','테스트A','school','풍무중','grade','중2','consulted_on','2099-01-05','level_test_on','2099-01-05'),
    jsonb_build_object('id','00000000-0000-4000-8000-00000000c002','reference_code','TEST-LT-2','student_name','테스트B','school','풍무중','grade','중2','consulted_on','2099-01-05','level_test_on','2099-01-05')));
  if n <> 2 then raise exception 'level test count %', n; end if;
  select value into v from public.mkt_values where metric_id=lt and metric_date='2099-01-05' and content_id is null;
  if v <> 2 then raise exception 'cell value %', v; end if;
  -- Enrolling one of them records the previous academy and monthly fee.
  n := public.mkt_save_funnel_students(ws, en, '2099-01-10', jsonb_build_array(
    jsonb_build_object('id','00000000-0000-4000-8000-00000000c001','reference_code','TEST-LT-1','student_name','테스트A','school','풍무중','grade','중2','consulted_on','2099-01-05','level_test_on','2099-01-05','enrolled_on','2099-01-10','previous_academy','OO어학원','monthly_fee',250000)));
  if n <> 1 then raise exception 'enroll count %', n; end if;
  if (select previous_academy from public.mkt_customers where id='00000000-0000-4000-8000-00000000c001') <> 'OO어학원' then raise exception 'previous academy'; end if;
  -- Removing a student lowers the day count.
  n := public.mkt_save_funnel_students(ws, lt, '2099-01-05', jsonb_build_array(
    jsonb_build_object('id','00000000-0000-4000-8000-00000000c002','reference_code','TEST-LT-2','student_name','테스트B','consulted_on','2099-01-05','level_test_on','2099-01-05','deleted',true)));
  if n <> 1 then raise exception 'after delete %', n; end if;
  -- Other funnel metrics cannot hold student lists.
  begin
    perform public.mkt_save_funnel_students(ws, (select id from public.mkt_metrics where workspace_id=ws and funnel_role='inflows' limit 1), '2099-01-05', '[]'::jsonb);
  exception when others then rejected := true; end;
  if not rejected then raise exception 'other funnel metric accepted'; end if;
end $$;
rollback;
