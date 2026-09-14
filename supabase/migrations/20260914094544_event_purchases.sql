-- Purchase cash expenditure and event consumption are deliberately separate.
create table public.mkt_purchases (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 title text not null check(length(trim(title))>0),
 purchased_on date not null,
 quantity integer not null check(quantity>0),
 total_amount numeric(14,2) not null check(total_amount>=0),
 notes text,
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,id)
);
create table public.mkt_event_items (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 event_id uuid not null,
 purchase_id uuid not null,
 quantity integer not null check(quantity>0),
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,event_id,purchase_id),
 foreign key(workspace_id,event_id) references public.marketing_events(workspace_id,id),
 foreign key(workspace_id,purchase_id) references public.mkt_purchases(workspace_id,id)
);
create index mkt_event_items_purchase_idx on public.mkt_event_items(workspace_id,purchase_id);
do $$ declare t text; begin
 foreach t in array array['mkt_purchases','mkt_event_items'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('create policy member_read on public.%I for select to authenticated using ((select private.is_workspace_member(workspace_id)))',t);
  execute format('create policy editor_insert on public.%I for insert to authenticated with check (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor'')))',t,t);
  execute format('create policy editor_update on public.%I for update to authenticated using (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor''))) with check (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor'')))',t,t,t);
  execute format('create trigger updated before update on public.%I for each row execute function private.set_updated_at()',t);
  execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t);
 end loop;
end $$;

-- Every consumption writer locks its lot; final-state checks support atomic edits and backup restores.
create function private.lock_mkt_purchase() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.workspace_id,new.purchase_id,new.event_id) is distinct from (old.workspace_id,old.purchase_id,old.event_id) then
  raise exception '연결을 변경하려면 기존 사용 수량을 제거하고 다시 선택하세요.';
 end if;
 perform 1 from public.mkt_purchases where workspace_id=new.workspace_id and id=new.purchase_id for update;
 if not found then raise exception '구매 기록을 찾을 수 없습니다.'; end if;
 return new;
end $$;
create trigger lock_purchase before insert or update on public.mkt_event_items for each row execute function private.lock_mkt_purchase();

create function private.check_mkt_stock() returns trigger language plpgsql set search_path='' as $$
declare p public.mkt_purchases; used bigint; pid uuid;
begin
 pid:=case when tg_table_name='mkt_purchases' then new.id else new.purchase_id end;
 select * into strict p from public.mkt_purchases where id=pid and workspace_id=new.workspace_id for update;
 select coalesce(sum(quantity),0) into used from public.mkt_event_items where purchase_id=pid and workspace_id=new.workspace_id and deleted_at is null;
 if used>p.quantity then raise exception '사용 수량이 구매 수량을 초과합니다: % (구매 %, 사용 %)',p.title,p.quantity,used; end if;
 if used>0 and p.deleted_at is not null then raise exception '사용 내역이 있는 구매는 삭제할 수 없습니다. 이벤트의 사용 수량을 먼저 제거하세요.'; end if;
 return null;
end $$;
create constraint trigger check_stock after insert or update on public.mkt_purchases deferrable initially deferred for each row execute function private.check_mkt_stock();
create constraint trigger check_stock after insert or update on public.mkt_event_items deferrable initially deferred for each row execute function private.check_mkt_stock();
revoke all on function private.lock_mkt_purchase(),private.check_mkt_stock() from public;

create function public.mkt_save_event_with_items(p_workspace uuid,p_event jsonb,p_items jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare eid uuid:=coalesce((p_event->>'id')::uuid,gen_random_uuid()); item jsonb;
begin
 if not private.is_workspace_member(p_workspace) then raise exception '접근 권한이 없습니다.'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception '물품 목록을 확인하세요.'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'purchase_id' having count(*)>1) then raise exception '같은 구매 건은 한 번만 선택하세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,0));
 -- Lock in stable order before modifying any usage.
 perform 1 from public.mkt_purchases where workspace_id=p_workspace order by id for update;
 insert into public.marketing_events(id,workspace_id,title,starts_at,ends_at,location,status,event_type,notes)
 values(eid,p_workspace,p_event->>'title',(p_event->>'starts_at')::timestamptz,(p_event->>'ends_at')::timestamptz,
 p_event->>'location',p_event->>'status',coalesce(p_event->>'event_type','other'),p_event->>'notes')
 on conflict(id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
 location=excluded.location,status=excluded.status,event_type=excluded.event_type,notes=excluded.notes
 where marketing_events.workspace_id=p_workspace;
 if not found then raise exception '이벤트 작업공간이 다릅니다.'; end if;
 update public.mkt_event_items set deleted_at=now() where workspace_id=p_workspace and event_id=eid and deleted_at is null;
 for item in select * from jsonb_array_elements(p_items) loop
  if not exists(select 1 from public.mkt_purchases where workspace_id=p_workspace and id=(item->>'purchase_id')::uuid and deleted_at is null) then raise exception '사용 가능한 구매 기록을 선택하세요.'; end if;
  insert into public.mkt_event_items(workspace_id,event_id,purchase_id,quantity)
  values(p_workspace,eid,(item->>'purchase_id')::uuid,(item->>'quantity')::integer)
  on conflict(workspace_id,event_id,purchase_id) do update set quantity=excluded.quantity,deleted_at=null;
 end loop;
 return eid;
end $$;
revoke all on function public.mkt_save_event_with_items(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.mkt_save_event_with_items(uuid,jsonb,jsonb) to authenticated;

-- Old backups preserve newly added records; new backups restore lots and consumption atomically.
do $$ declare def text; begin
 select pg_get_functiondef('public.mkt_restore_backup(uuid,jsonb)'::regprocedure) into def;
 def:=replace(def,'''report_snapshots'']','''report_snapshots'',''mkt_purchases'',''mkt_event_items'']');
 def:=replace(def,'payload:=p_backup->t;','payload:=p_backup->t;
  if payload is null and t in (''mkt_purchases'',''mkt_event_items'') then continue; end if;');
 execute def;
end $$;
notify pgrst,'reload schema';
