begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare
 w uuid := 'bef296c2-53ff-4865-8222-95bec0098350';
 ch uuid := '089e0f66-8cbe-43e1-bc2d-fa7c78d9bfd1';
 before_values text;
 before_costs text;
begin
 select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id)::text,'')) into before_values from public.mkt_values v where workspace_id=w;
 select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) into before_costs from public.mkt_costs c where workspace_id=w;
 update public.channels set name='당근 마켓' where workspace_id=w and id=ch;
 insert into public.contents(workspace_id,channel_id,title,content_type,status,notes)
 select w,ch,'비즈프로필','business_profile','published','방문수·쿠폰 발급수는 하루 수치, 단골수는 해당 날짜의 총 단골 수.'
 where not exists(select 1 from public.contents where workspace_id=w and channel_id=ch and content_type='business_profile' and deleted_at is null);
 insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,mode,unit,sort_order)
 values (w,ch,'bizProfileVisits','방문수','total','daily','count',0),
 (w,ch,'bizProfileRegulars','단골수','total','latest','count',1),
 (w,ch,'bizProfileCoupons','쿠폰 발급수','total','daily','count',2)
 on conflict(workspace_id,channel_id,scope,key) do nothing;
 update public.mkt_metrics m set deleted_at=now()
 where m.workspace_id=w and m.channel_id=ch and m.scope='paid'
 and m.key in ('paidReach','regulars','interests','couponDownloads') and m.deleted_at is null
 and not exists(select 1 from public.mkt_values v where v.metric_id=m.id and v.deleted_at is null and v.value is not null);
 if before_values is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id)::text,'')) from public.mkt_values v where workspace_id=w)
 or before_costs is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) from public.mkt_costs c where workspace_id=w)
 then raise exception 'Existing values or costs changed'; end if;
end $$;
commit;
