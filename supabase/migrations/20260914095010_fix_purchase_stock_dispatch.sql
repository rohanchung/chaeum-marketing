create or replace function private.check_mkt_stock() returns trigger language plpgsql set search_path='' as $$
declare p public.mkt_purchases; used bigint; pid uuid;
begin
 if tg_table_name='mkt_purchases' then pid:=new.id; else pid:=new.purchase_id; end if;
 select * into strict p from public.mkt_purchases where id=pid and workspace_id=new.workspace_id for update;
 select coalesce(sum(quantity),0) into used from public.mkt_event_items where purchase_id=pid and workspace_id=new.workspace_id and deleted_at is null;
 if used>p.quantity then raise exception '사용 수량이 구매 수량을 초과합니다: % (구매 %, 사용 %)',p.title,p.quantity,used; end if;
 if used>0 and p.deleted_at is not null then raise exception '사용 내역이 있는 구매는 삭제할 수 없습니다. 이벤트의 사용 수량을 먼저 제거하세요.'; end if;
 return null;
end $$;
