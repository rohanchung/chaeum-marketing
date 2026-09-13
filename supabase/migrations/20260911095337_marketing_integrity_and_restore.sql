-- Transactional setup / restore, role restrictions, and preservation safeguards.
alter table public.contents add constraint contents_same_workspace_channel foreign key(workspace_id,channel_id) references public.channels(workspace_id,id);

create function public.mkt_save_channel(p_workspace uuid,p_channel jsonb,p_metrics jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare cid uuid := coalesce((p_channel->>'id')::uuid,gen_random_uuid()); m jsonb;
begin
 if not private.is_workspace_member(p_workspace) then raise exception '접근 권한이 없습니다.'; end if;
 insert into public.channels(id,workspace_id,name,color,measurement_template,channel_type,is_active)
 values(cid,p_workspace,p_channel->>'name',p_channel->>'color',coalesce(p_channel->>'measurement_template','custom'),'other',true)
 on conflict(id) do update set name=excluded.name,color=excluded.color,measurement_template=excluded.measurement_template
 where channels.workspace_id=p_workspace;
 if not found then raise exception '채널 작업공간이 다릅니다.'; end if;
 for m in select * from jsonb_array_elements(p_metrics) loop
 insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,unit,mode,numerator,denominator,multiplier,sort_order)
 values(p_workspace,cid,m->>'key',m->>'name',m->>'scope',m->>'unit',m->>'mode',m->>'numerator',m->>'denominator',(m->>'multiplier')::numeric,(m->>'sort_order')::int)
 on conflict(workspace_id,channel_id,scope,key) do nothing;
 end loop;
 return cid;
end; $$;
revoke all on function public.mkt_save_channel(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.mkt_save_channel(uuid,jsonb,jsonb) to authenticated;

-- Restore only application records, never auth, membership, or historical audit logs.
-- Missing rows in the backup do not delete live data. All included IDs are restored atomically.
create function public.mkt_restore_backup(p_workspace uuid,p_backup jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare t text; assignments text; payload jsonb;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(select auth.uid()) and role='owner') then raise exception '소유자만 복원할 수 있습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,0));
 foreach t in array array['channels','contents','marketing_events','mkt_metrics','mkt_promotions','mkt_values','mkt_customers','mkt_payments','mkt_costs','report_snapshots'] loop
  payload:=p_backup->t;
  if payload is null or jsonb_typeof(payload)<>'array' then raise exception '백업 테이블이 누락되었습니다: %',t; end if;
  if exists(select 1 from jsonb_array_elements(payload) r where r->>'workspace_id' is distinct from p_workspace::text) then raise exception '작업공간이 다른 기록이 포함되어 있습니다.'; end if;
  select string_agg(format('%I=excluded.%I',column_name,column_name),',') into assignments from information_schema.columns where table_schema='public' and table_name=t and column_name not in ('id','workspace_id','created_at');
  execute format('insert into public.%1$I select * from jsonb_populate_recordset(null::public.%1$I,$1) %3$s on conflict(id) do update set %2$s where %1$I.workspace_id=$2',t,assignments,
   case when t='mkt_payments' then 'order by adjusts_id nulls first,paid_on' else '' end) using payload,p_workspace;
 end loop;
end; $$;
revoke all on function public.mkt_restore_backup(uuid,jsonb) from public,anon;
grant execute on function public.mkt_restore_backup(uuid,jsonb) to authenticated;

-- Master records are soft deleted; membership alone does not give a viewer write access.
do $$ declare t text; pol record; begin
 foreach t in array array['channels','contents','marketing_events','report_snapshots'] loop
  for pol in select policyname from pg_policies where schemaname='public' and tablename=t and cmd in ('INSERT','UPDATE','DELETE','ALL') loop
   execute format('drop policy %I on public.%I',pol.policyname,t);
  end loop;
  execute format('revoke all on public.%I from anon',t);
  execute format('revoke delete on public.%I from authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('create policy editor_insert on public.%I for insert to authenticated with check (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor'')))',t,t);
  execute format('create policy editor_update on public.%I for update to authenticated using (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor''))) with check (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor'')))',t,t,t);
 end loop;
end $$;

-- Financial entries survive customer archival/deletion. Prevent source/cost ambiguity.
create function private.guard_mkt_finance() returns trigger language plpgsql set search_path='' as $$
declare original public.mkt_payments; original_customer public.mkt_customers;
begin
 if tg_table_name='mkt_payments' then
  select * into strict original_customer from public.mkt_customers where id=new.customer_id and workspace_id=new.workspace_id;
  if original_customer.enrolled_on is null or new.paid_on<original_customer.enrolled_on then raise exception '등록일 이후의 등록 관련 결제를 입력하세요.'; end if;
  if new.adjusts_id is null and new.service_cost<0 then raise exception '일반 결제의 서비스 원가는 0 이상이어야 합니다.'; end if;
  if new.amount<0 then
    select * into strict original from public.mkt_payments where id=new.adjusts_id and workspace_id=new.workspace_id for update;
    if original.deleted_at is not null then raise exception '삭제된 결제는 환불할 수 없습니다.'; end if;
    if -new.amount + coalesce((select -sum(amount) from public.mkt_payments where adjusts_id=new.adjusts_id and amount<0 and deleted_at is null and id<>new.id),0)>original.amount then raise exception '누적 환불이 원결제 금액을 초과합니다.'; end if;
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.mkt_payments where adjusts_id=old.id and deleted_at is null) and (new.amount,new.customer_id,new.paid_on,new.deleted_at) is distinct from (old.amount,old.customer_id,old.paid_on,old.deleted_at) then raise exception '조정 내역이 있는 원결제는 변경할 수 없습니다. 조정 거래를 먼저 확인하세요.'; end if;
 elsif tg_table_name='mkt_costs' and new.promotion_id is not null and new.category='media' and not new.grid_entry then
  raise exception '집행의 광고비는 일별 광고비 기록으로 관리하세요.';
 end if;
 return new;
end; $$;
create trigger finance_guard before insert or update on public.mkt_payments for each row execute function private.guard_mkt_finance();
create trigger finance_guard before insert or update on public.mkt_costs for each row execute function private.guard_mkt_finance();
revoke all on function private.guard_mkt_finance() from public;
revoke all on function private.validate_mkt_row() from public;
-- Extra FK indexes keep lookup/restore costs bounded as history grows.
do $$ declare t text; c text; begin
 foreach t in array array['mkt_values','mkt_customers','mkt_costs','mkt_payments','mkt_promotions','mkt_metrics'] loop
 for c in select column_name from information_schema.columns where table_schema='public' and table_name=t and column_name in ('channel_id','content_id','promotion_id','event_id','customer_id','adjusts_id') loop
  execute format('create index if not exists %I on public.%I(workspace_id,%I)',t||'_'||c||'_idx',t,c);
 end loop;
 end loop;
end $$;
notify pgrst,'reload schema';
