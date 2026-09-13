begin;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
set local role authenticated;
do $test$
declare ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350';
 ch uuid; ct uuid; pr uuid; m1 uuid; m2 uuid; mp uuid; customer uuid; payment uuid; result numeric; denied boolean; backup jsonb;
begin
 ch:=public.mkt_save_channel(ws,'{"name":"__검증용_자동롤백","measurement_template":"custom","color":"#276e4e"}','[]');
 insert into public.contents(workspace_id,channel_id,title,status) values(ws,ch,'__검증용 소재','published') returning id into ct;
 insert into public.mkt_promotions(workspace_id,content_id,title,start_date,end_date) values(ws,ct,'__검증용 광고','2026-09-01','2026-09-10') returning id into pr;
 insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,mode) values(ws,ch,'test_views','조회수','total','cumulative') returning id into m1;
 insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,mode) values(ws,ch,'test_likes','좋아요','total','cumulative') returning id into m2;
 insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,mode) values(ws,ch,'test_clicks','클릭','paid','daily') returning id into mp;
 perform public.mkt_save_cells(ws,jsonb_build_array(jsonb_build_object('kind','metric','metric_id',m1,'content_id',ct,'date','2026-09-01','value',123),jsonb_build_object('kind','metric','metric_id',m2,'content_id',ct,'date','2026-09-01','value',8)));
 if (select value from public.mkt_values where metric_id=m1)<>123 or (select value from public.mkt_values where metric_id=m2)<>8 then raise exception 'Independent metric test failed'; end if;
 perform public.mkt_save_cells(ws,jsonb_build_array(jsonb_build_object('kind','metric','metric_id',m1,'content_id',ct,'date','2026-09-01','value',99)));
 if (select count(*) from public.mkt_values where metric_id=m1)<>1 then raise exception 'Duplicate save test failed'; end if;
 denied:=false;
 begin
 perform public.mkt_save_cells(ws,jsonb_build_array(jsonb_build_object('kind','metric','metric_id',m2,'content_id',ct,'date','2026-09-01','value',55),jsonb_build_object('kind','metric','metric_id',mp,'content_id',ct,'promotion_id',pr,'date','2026-09-11','value',1)));
 exception when others then denied:=true; end;
 if not denied or (select value from public.mkt_values where metric_id=m2)<>8 then raise exception 'Atomic rollback / dates test failed'; end if;
 denied:=false;begin update public.mkt_metrics set mode='daily' where id=m1;exception when others then denied:=true;end;
 if not denied then raise exception 'Metric meaning guard failed';end if;
 perform public.mkt_save_cells(ws,jsonb_build_array(jsonb_build_object('kind','cost','promotion_id',pr,'date','2026-09-01','value',0)));
 if not exists(select 1 from public.mkt_costs where promotion_id=pr and amount=0 and deleted_at is null) then raise exception 'Zero cost test failed';end if;
 perform public.mkt_save_cells(ws,jsonb_build_array(jsonb_build_object('kind','cost','promotion_id',pr,'date','2026-09-01','value',200)));
 if (select sum(amount) from public.mkt_costs where promotion_id=pr)<>200 then raise exception 'Cost overwrite test failed';end if;
 insert into public.mkt_customers(workspace_id,reference_code,consulted_on,enrolled_on,promotion_id,confidence) values(ws,'__검증용 고객','2026-09-01','2026-09-02',pr,'reported') returning id into customer;
 insert into public.mkt_payments(workspace_id,customer_id,paid_on,amount,service_cost) values(ws,customer,'2026-09-02',1000,100) returning id into payment;
 insert into public.mkt_payments(workspace_id,customer_id,paid_on,amount,service_cost,adjusts_id) values(ws,customer,'2026-09-03',-100,-10,payment);
 denied:=false;begin insert into public.mkt_payments(workspace_id,customer_id,paid_on,amount,adjusts_id) values(ws,customer,'2026-09-03',-1000,payment);exception when others then denied:=true;end;
 if not denied then raise exception 'Refund maximum failed';end if;
 update public.contents set status='archived',archived_at=now() where id=ct;
 update public.contents set deleted_at=now() where id=ct;
 update public.contents set deleted_at=null,status='published' where id=ct;
 if (select count(*) from public.mkt_values where content_id=ct)<>2 then raise exception 'Lifecycle preservation failed';end if;
 if (select sum(amount) from public.mkt_payments where customer_id=customer)<>900 then raise exception 'Payment refund failed';end if;
 -- A complete backup roundtrip within this transaction, with no changes outside the test.
 select jsonb_build_object(
 'channels',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.channels x where id=ch),
 'contents',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.contents x where id=ct),
 'marketing_events','[]'::jsonb,
 'mkt_metrics',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.mkt_metrics x where channel_id=ch),
 'mkt_promotions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.mkt_promotions x where id=pr),
 'mkt_values',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.mkt_values x where content_id=ct),
 'mkt_customers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.mkt_customers x where id=customer),
 'mkt_payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.mkt_payments x where customer_id=customer),
 'mkt_costs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.mkt_costs x where promotion_id=pr),
 'report_snapshots','[]'::jsonb) into backup;
 perform public.mkt_restore_backup(ws,backup);
end $test$;
rollback;
select 'PASS: authenticated CRUD, independent metrics, atomic bulk rollback, promotion dates, metric immutability, zero cost, cost overwrite, refunds, lifecycle, backup restore' result;
