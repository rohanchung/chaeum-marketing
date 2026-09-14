begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare ws uuid:='bef296c2-53ff-4865-8222-95bec0098350'; pid uuid; eid uuid; backup jsonb:='{}'; rows jsonb; t text;
begin
 insert into public.mkt_purchases(workspace_id,title,purchased_on,quantity,total_amount) values(ws,'__restore_purchase_test__',current_date,500,100000) returning id into pid;
 eid:=public.mkt_save_event_with_items(ws,jsonb_build_object('title','__restore_event_test__','starts_at',now(),'status','completed'),jsonb_build_array(jsonb_build_object('purchase_id',pid,'quantity',150)));
 foreach t in array array['channels','contents','marketing_events','mkt_metrics','mkt_promotions','mkt_values','mkt_customers','mkt_payments','mkt_costs','report_snapshots','mkt_purchases','mkt_event_items'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from public.%I r where workspace_id=$1',t) into rows using ws;
  backup:=backup||jsonb_build_object(t,rows);
 end loop;
 update public.mkt_event_items set quantity=200 where event_id=eid;
 perform public.mkt_restore_backup(ws,backup);
 set constraints all immediate;
 if (select quantity from public.mkt_event_items where event_id=eid)<>150 then raise exception 'backup usage restore failed'; end if;
 perform public.mkt_restore_backup(ws,backup-'mkt_purchases'-'mkt_event_items');
 if not exists(select 1 from public.mkt_purchases where id=pid) then raise exception 'legacy backup lost purchases'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
do $$ declare rejected boolean:=false; begin
 if exists(select 1 from public.mkt_purchases) or exists(select 1 from public.mkt_event_items) then raise exception 'outsider can read purchases'; end if;
 begin
  perform public.mkt_save_event_with_items('bef296c2-53ff-4865-8222-95bec0098350',jsonb_build_object('title','__outsider__','starts_at',now(),'status','completed'),'[]');
 exception when raise_exception then rejected:=true;
 end;
 if not rejected then raise exception 'outsider can write'; end if;
end $$;
rollback;
