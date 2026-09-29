begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350'; rejected boolean := false; sid uuid;
begin
  -- Assumptions: one row per workspace, editable by owners/editors.
  insert into public.mkt_ltv_settings (workspace_id, contribution_rate, retention_months) values (ws, 0.45, 6) returning id into sid;
  update public.mkt_ltv_settings set retention_months = 8 where id = sid;
  if (select retention_months from public.mkt_ltv_settings where id = sid) <> 8 then raise exception 'settings update failed'; end if;

  -- Per-student tuition and withdrawal date; withdrawal cannot precede enrollment.
  insert into public.mkt_customers (workspace_id, reference_code, consulted_on, enrolled_on, monthly_fee, confidence)
  values (ws, 'LTV-TEST', '2026-09-01', '2026-09-05', 250000, 'unknown');
  begin
    update public.mkt_customers set withdrawn_on = '2026-09-01' where reference_code = 'LTV-TEST' and workspace_id = ws;
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'withdrawal before enrollment accepted'; end if;
  update public.mkt_customers set withdrawn_on = '2026-12-01' where reference_code = 'LTV-TEST' and workspace_id = ws;

  -- Cost purpose (null = acquisition).
  insert into public.mkt_costs (workspace_id, expense_date, category, amount, payment_status, title, cost_purpose)
  values (ws, '2026-09-10', 'other', 1000, 'paid', 'LTV 테스트 비용', 'launch');
end $$;
rollback;
