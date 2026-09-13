create or replace function private.guard_mkt_relationships() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op<>'UPDATE' then return new; end if;
 if tg_table_name='mkt_customers' then
  if exists(select 1 from public.mkt_payments where customer_id=new.id and (new.enrolled_on is null or paid_on<new.enrolled_on)) then raise exception '결제 기록보다 늦게 등록일을 변경할 수 없습니다.'; end if;
 elsif tg_table_name='mkt_promotions' then
  if new.content_id<>old.content_id then
   if exists(select 1 from public.mkt_costs where promotion_id=old.id) or exists(select 1 from public.mkt_customers where promotion_id=old.id) then raise exception '비용 또는 전환이 연결된 집행의 소재는 변경할 수 없습니다.'; end if;
  end if;
 elsif tg_table_name='contents' then
  if new.channel_id is distinct from old.channel_id then
   if exists(select 1 from public.mkt_values where content_id=old.id) or exists(select 1 from public.mkt_promotions where content_id=old.id) or exists(select 1 from public.mkt_costs where content_id=old.id) or exists(select 1 from public.mkt_customers where content_id=old.id) then raise exception '실적이 연결된 소재는 다른 채널로 이동할 수 없습니다.'; end if;
  end if;
 end if;
 return new;
end; $$;
