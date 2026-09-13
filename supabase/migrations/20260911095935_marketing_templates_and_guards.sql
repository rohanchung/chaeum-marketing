-- Initial templates for existing known channels. Only definitions, no fabricated values.
insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,mode,unit,sort_order)
select c.workspace_id,c.id,m.key,m.name,'total','cumulative','count',m.ord
from public.channels c cross join (values
('views','조회수',0),('reach','도달',1),('likes','좋아요',2),('comments','댓글',3),
('saves','저장',4),('shares','공유',5),('profileVisits','프로필 방문',6),('linkClicks','외부 링크 누름',7),('addressClicks','비즈니스 주소 누름',8)) m(key,name,ord)
where c.measurement_template='social_content' or c.name like '%인스타%'
on conflict(workspace_id,channel_id,scope,key) do nothing;
insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,mode,unit,sort_order)
select c.workspace_id,c.id,m.key,m.name,'total',m.mode,'count',m.ord from public.channels c cross join
(values ('views','조회수','daily',0),('likes','공감','cumulative',1),('comments','댓글','cumulative',2))m(key,name,mode,ord)
where c.measurement_template='blog_content' or c.name like '%블로그%'
on conflict(workspace_id,channel_id,scope,key) do nothing;
insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,mode,unit,sort_order,numerator,denominator,multiplier)
select c.workspace_id,c.id,m.key,m.name,'paid',m.mode,m.unit,m.ord,m.num,m.den,m.mult from public.channels c cross join
(values ('impressions','노출수','daily','count',20,null,null,100),('clicks','클릭수','daily','count',21,null,null,100),('reactions','반응수','daily','count',22,null,null,100),
('ctr','클릭률','ratio','percent',23,'clicks','impressions',100),('cpc','클릭당 비용','ratio','currency',24,'$spend','clicks',1),('reactionCost','반응당 비용','ratio','currency',25,'$spend','reactions',1))m(key,name,mode,unit,ord,num,den,mult)
where c.measurement_template in ('social_content','paid_ad','search_ad') or c.name like '%인스타%' or c.name like '%당근%'
on conflict(workspace_id,channel_id,scope,key) do nothing;

create function private.guard_mkt_relationships() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='mkt_customers' and tg_op='UPDATE' then
  if exists(select 1 from public.mkt_payments where customer_id=new.id and (new.enrolled_on is null or paid_on<new.enrolled_on)) then raise exception '결제 기록보다 늦게 등록일을 변경할 수 없습니다.'; end if;
 elsif tg_table_name='mkt_promotions' and tg_op='UPDATE' and new.content_id<>old.content_id then
  if exists(select 1 from public.mkt_costs where promotion_id=old.id) or exists(select 1 from public.mkt_customers where promotion_id=old.id) then raise exception '비용 또는 전환이 연결된 집행의 소재는 변경할 수 없습니다.'; end if;
 elsif tg_table_name='contents' and tg_op='UPDATE' and new.channel_id is distinct from old.channel_id then
  if exists(select 1 from public.mkt_values where content_id=old.id) or exists(select 1 from public.mkt_promotions where content_id=old.id) or exists(select 1 from public.mkt_costs where content_id=old.id) or exists(select 1 from public.mkt_customers where content_id=old.id) then raise exception '실적이 연결된 소재는 다른 채널로 이동할 수 없습니다.'; end if;
 end if;
 return new;
end; $$;
create trigger relationship_guard before update on public.mkt_customers for each row execute function private.guard_mkt_relationships();
create trigger relationship_guard before update on public.mkt_promotions for each row execute function private.guard_mkt_relationships();
create trigger relationship_guard before update on public.contents for each row execute function private.guard_mkt_relationships();
revoke all on function private.guard_mkt_relationships() from public;

create or replace function public.mkt_save_cells(p_workspace uuid,p_cells jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare cell jsonb; begin
 if not private.is_workspace_member(p_workspace) then raise exception '접근 권한이 없습니다.'; end if;
 if jsonb_array_length(p_cells)>5000 then raise exception '한 번에 5000칸까지 저장할 수 있습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,0));
 for cell in select * from jsonb_array_elements(p_cells) loop
  if cell->>'kind'='cost' then
   insert into public.mkt_costs(workspace_id,promotion_id,expense_date,category,amount,title,grid_entry,deleted_at)
   values(p_workspace,(cell->>'promotion_id')::uuid,(cell->>'date')::date,'media',coalesce((cell->>'value')::numeric,0),'일별 광고비',true,
    case when cell->>'value' is null then now() end)
   on conflict(workspace_id,promotion_id,expense_date) where grid_entry
   do update set amount=excluded.amount,deleted_at=excluded.deleted_at,payment_status='paid';
  else
   insert into public.mkt_values(workspace_id,metric_id,content_id,promotion_id,metric_date,value)
   values(p_workspace,(cell->>'metric_id')::uuid,(cell->>'content_id')::uuid,(cell->>'promotion_id')::uuid,(cell->>'date')::date,(cell->>'value')::numeric)
   on conflict(workspace_id,metric_id,content_id,promotion_id,metric_date)
   do update set value=excluded.value,deleted_at=null;
  end if;
 end loop;
end; $$;
notify pgrst,'reload schema';
