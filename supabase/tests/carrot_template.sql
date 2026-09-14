-- Integration test, deliberately rolled back. Uses the existing Chaeum owner.
begin;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
set local role authenticated;
do $test$
declare ws uuid := 'bef296c2-53ff-4865-8222-95bec0098350'; ch uuid; ct uuid; denied boolean:=false; start_count int; k jsonb;
begin
 select id into ch from public.channels where workspace_id=ws and name='당근 광고' and deleted_at is null;
 if ch is null then raise exception 'Carrot channel missing'; end if;
 if not exists(select 1 from public.mkt_metrics where channel_id=ch and key='paidReach' and mode='latest') then raise exception 'Carrot template missing'; end if;
 k:=public.mkt_server_clock();
 if k->>'today' <> (clock_timestamp() at time zone 'Asia/Seoul')::date::text then raise exception 'Korean server date incorrect'; end if;
 ct:=public.mkt_create_ad_content(ws,jsonb_build_object('channel_id',ch,'title','__검증용_당근_RPC'),jsonb_build_object('start_date','2026-09-14','end_date','2026-09-16'));
 if (select count(*) from public.mkt_promotions where content_id=ct)<>1 then raise exception 'Initial promotion was not created'; end if;
 if not exists(select 1 from public.contents where id=ct and content_type='ad_creative') then raise exception 'Not an ad creative'; end if;
 select count(*) into start_count from public.contents where workspace_id=ws;
 begin
   perform public.mkt_create_ad_content(ws,jsonb_build_object('channel_id',ch,'title','__검증용_롤백'),jsonb_build_object('start_date','2026-09-16','end_date','2026-09-14'));
 exception when others then denied:=true; end;
 if not denied or (select count(*) from public.contents where workspace_id=ws)<>start_count then raise exception 'Invalid dates left partial content'; end if;
 denied:=false;
 begin
   perform public.mkt_create_ad_content(ws,jsonb_build_object('channel_id',gen_random_uuid(),'title','__검증용_격리'),jsonb_build_object('start_date','2026-09-14','end_date','2026-09-16'));
 exception when others then denied:=true; end;
 if not denied then raise exception 'Unrelated channel accepted'; end if;
end $test$;
reset role;
update public.workspace_members set role='viewer' where workspace_id='bef296c2-53ff-4865-8222-95bec0098350' and user_id='852e21eb-5d5c-49de-b69e-071c66f5d39a';
set local role authenticated;
do $$ declare ch uuid; denied boolean:=false; begin
 select id into ch from public.channels where name='당근 광고' and workspace_id='bef296c2-53ff-4865-8222-95bec0098350';
 begin perform public.mkt_create_ad_content('bef296c2-53ff-4865-8222-95bec0098350',jsonb_build_object('channel_id',ch,'title','__viewer'),jsonb_build_object('start_date','2026-09-14','end_date','2026-09-16'));
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Viewer could create ad'; end if;
end $$;
reset role;
set local role anon;
do $$ declare denied boolean:=false; begin
 begin perform public.mkt_server_clock(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Anonymous clock permission open'; end if;
 denied:=false;
 begin perform public.mkt_create_ad_content(gen_random_uuid(),'{}','{}'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Anonymous create permission open'; end if;
end $$;
rollback;
select 'PASS: Carrot template, server date, atomic creation, invalid dates, workspace isolation, viewer and anonymous restrictions' as result;
