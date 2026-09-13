-- Additive v3. Existing facts and legacy performance rows remain untouched.
alter table public.contents add column if not exists archived_at timestamptz;
create unique index if not exists channels_workspace_id_id on public.channels(workspace_id,id);
create unique index if not exists contents_workspace_id_id on public.contents(workspace_id,id);
create unique index if not exists events_workspace_id_id on public.marketing_events(workspace_id,id);

create table public.mkt_metrics (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 channel_id uuid, key text not null, name text not null check(length(trim(name))>0),
 scope text not null check(scope in ('funnel','total','organic','paid')),
 unit text not null default 'count' check(unit in ('count','currency','percent')),
 mode text not null default 'daily' check(mode in ('daily','cumulative','latest','ratio')),
 numerator text, denominator text, multiplier numeric not null default 100,
 sort_order integer not null default 0, deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique nulls not distinct(workspace_id,channel_id,scope,key),
 foreign key(workspace_id,channel_id) references public.channels(workspace_id,id),
 check((scope='funnel')=(channel_id is null)),
 check(mode <> 'ratio' or (numerator is not null and denominator is not null)),
 check(scope <> 'funnel' or mode='daily')
);
create table public.mkt_promotions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 content_id uuid not null, title text not null, start_date date not null, end_date date not null,
 notes text, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), foreign key(workspace_id,content_id) references public.contents(workspace_id,id),
 check(end_date>=start_date)
);
create table public.mkt_values (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 metric_id uuid not null, content_id uuid, promotion_id uuid, metric_date date not null,
 value numeric(16,4), notes text, deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique nulls not distinct(workspace_id,metric_id,content_id,promotion_id,metric_date),
 foreign key(workspace_id,metric_id) references public.mkt_metrics(workspace_id,id),
 foreign key(workspace_id,content_id) references public.contents(workspace_id,id),
 foreign key(workspace_id,promotion_id) references public.mkt_promotions(workspace_id,id),
 check(value is null or (value >= 0 and value <> 'NaN'::numeric))
);
create table public.mkt_customers (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 reference_code text not null check(length(trim(reference_code))>0), consulted_on date not null, enrolled_on date,
 channel_id uuid, content_id uuid, promotion_id uuid, event_id uuid,
 confidence text not null default 'unknown' check(confidence in ('reported','direct','inferred','unknown')),
 notes text, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,reference_code),
 foreign key(workspace_id,channel_id) references public.channels(workspace_id,id),
 foreign key(workspace_id,content_id) references public.contents(workspace_id,id),
 foreign key(workspace_id,promotion_id) references public.mkt_promotions(workspace_id,id),
 foreign key(workspace_id,event_id) references public.marketing_events(workspace_id,id),
 check(enrolled_on is null or enrolled_on>=consulted_on),
 check(num_nonnulls(channel_id,content_id,promotion_id,event_id)<=1),
 check(confidence not in ('reported','direct') or num_nonnulls(channel_id,content_id,promotion_id,event_id)=1)
);
create table public.mkt_payments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 customer_id uuid not null, paid_on date not null, amount numeric(14,2) not null,
 service_cost numeric(14,2), adjusts_id uuid, notes text, deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id),
 foreign key(workspace_id,customer_id) references public.mkt_customers(workspace_id,id),
 foreign key(workspace_id,adjusts_id) references public.mkt_payments(workspace_id,id),
 check(amount <> 0 and amount <> 'NaN'::numeric),
 check(service_cost is null or service_cost <> 'NaN'::numeric),
 check(amount>0 or adjusts_id is not null),
 check(id is distinct from adjusts_id)
);
create table public.mkt_costs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 expense_date date not null, category text not null check(category in ('media','production','goods','event','agency','other')),
 amount numeric(14,2) not null check(amount>=0 and amount <> 'NaN'::numeric),
 payment_status text not null default 'paid' check(payment_status in ('planned','pending','paid','cancelled')),
 channel_id uuid, content_id uuid, promotion_id uuid, event_id uuid,
 title text not null, notes text, grid_entry boolean not null default false, legacy_id uuid unique,
 deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,channel_id) references public.channels(workspace_id,id),
 foreign key(workspace_id,content_id) references public.contents(workspace_id,id),
 foreign key(workspace_id,promotion_id) references public.mkt_promotions(workspace_id,id),
 foreign key(workspace_id,event_id) references public.marketing_events(workspace_id,id),
 check(num_nonnulls(channel_id,content_id,promotion_id,event_id)<=1),
 check(not grid_entry or (promotion_id is not null and category='media'))
);
create unique index mkt_costs_grid_unique on public.mkt_costs(workspace_id,promotion_id,expense_date) where grid_entry;
create index mkt_values_period on public.mkt_values(workspace_id,metric_date);
create index mkt_values_metric on public.mkt_values(workspace_id,metric_id,content_id,promotion_id,metric_date);
create index mkt_costs_period on public.mkt_costs(workspace_id,expense_date);
create index mkt_payments_period on public.mkt_payments(workspace_id,paid_on);
create index mkt_customers_period on public.mkt_customers(workspace_id,consulted_on);

-- Only new editable domain tables. Invoker validation never bypasses row security.
create function private.validate_mkt_row() returns trigger language plpgsql set search_path='' as $$
declare m public.mkt_metrics; p public.mkt_promotions; c public.contents; payment public.mkt_payments;
begin
 if tg_table_name='mkt_values' then
  select * into strict m from public.mkt_metrics where id=new.metric_id and workspace_id=new.workspace_id;
  if m.mode='ratio' then raise exception '계산 지표는 직접 입력할 수 없습니다.'; end if;
  if m.scope='funnel' then
   if new.content_id is not null or new.promotion_id is not null then raise exception '학원 지표의 대상이 올바르지 않습니다.'; end if;
  else
   select * into strict c from public.contents where id=new.content_id and workspace_id=new.workspace_id;
   if c.channel_id is distinct from m.channel_id then raise exception '채널과 지표가 일치하지 않습니다.'; end if;
   if (m.scope='paid') <> (new.promotion_id is not null) then raise exception '광고 지표의 집행을 지정하세요.'; end if;
  end if;
  if m.unit='count' and new.value is not null and new.value<>trunc(new.value) then raise exception '건수는 정수로 입력하세요.'; end if;
  if new.promotion_id is not null then
   select * into strict p from public.mkt_promotions where id=new.promotion_id and workspace_id=new.workspace_id;
   if p.content_id<>new.content_id or new.metric_date not between p.start_date and p.end_date then raise exception '광고 집행 기간 또는 소재가 일치하지 않습니다.'; end if;
  end if;
 elsif tg_table_name='mkt_metrics' then
  if tg_op='UPDATE' and (new.mode,new.scope,new.channel_id,new.key,new.unit,new.numerator,new.denominator,new.multiplier)
      is distinct from (old.mode,old.scope,old.channel_id,old.key,old.unit,old.numerator,old.denominator,old.multiplier)
      and exists(select 1 from public.mkt_values where metric_id=old.id) then
    raise exception '기록이 있는 지표의 측정 의미는 변경할 수 없습니다. 새 지표를 만드세요.';
  end if;
 elsif tg_table_name='mkt_promotions' then
  if tg_op='UPDATE' and (
   exists(select 1 from public.mkt_values where promotion_id=new.id and (metric_date not between new.start_date and new.end_date or content_id<>new.content_id))
   or exists(select 1 from public.mkt_costs where promotion_id=new.id and expense_date not between new.start_date and new.end_date)
  ) then raise exception '기존 실적이 집행 기간 밖으로 벗어납니다.'; end if;
 elsif tg_table_name='mkt_costs' then
  if new.promotion_id is not null then
   select * into strict p from public.mkt_promotions where id=new.promotion_id and workspace_id=new.workspace_id;
   if new.expense_date not between p.start_date and p.end_date then raise exception '집행 기간 안의 날짜를 입력하세요.'; end if;
  end if;
 elsif tg_table_name='mkt_payments' then
  if new.adjusts_id is not null then
   select * into strict payment from public.mkt_payments where id=new.adjusts_id and workspace_id=new.workspace_id;
   if payment.customer_id<>new.customer_id or payment.paid_on>new.paid_on or payment.amount<=0 then raise exception '동일 고객의 원결제 이후에 조정하세요.'; end if;
  end if;
 end if;
 return new;
end; $$;

do $$ declare t text; begin
 foreach t in array array['mkt_metrics','mkt_promotions','mkt_values','mkt_customers','mkt_payments','mkt_costs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('create policy member_read on public.%I for select to authenticated using ((select private.is_workspace_member(workspace_id)))',t);
  execute format('create policy member_insert on public.%I for insert to authenticated with check (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor'')))',t,t);
  execute format('create policy member_update on public.%I for update to authenticated using (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor''))) with check (exists(select 1 from public.workspace_members wm where wm.workspace_id=%I.workspace_id and wm.user_id=(select auth.uid()) and wm.role in (''owner'',''editor'')))',t,t,t);
  execute format('create trigger updated before update on public.%I for each row execute function private.set_updated_at()',t);
  execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t);
  if t<>'mkt_customers' then execute format('create trigger validate before insert or update on public.%I for each row execute function private.validate_mkt_row()',t); end if;
 end loop;
end $$;

-- Seed definitions, not fabricated measurements. Existing channels remain intact.
insert into public.mkt_metrics(workspace_id,key,name,scope,sort_order)
select w.id,m.key,m.name,'funnel',m.ord from public.workspaces w cross join
(values('inflows','유입',0),('kakao','카카오 상담',1),('phone','전화 상담',2),('visit','방문 상담',3),('enrollments','신규 등록',4)) m(key,name,ord);
insert into public.mkt_values(workspace_id,metric_id,metric_date,value,notes,deleted_at)
select f.workspace_id,m.id,f.metric_date,v.value,f.notes,f.deleted_at
from public.daily_funnel_records f cross join lateral
(values('inflows',f.inflows),('kakao',f.kakao_consultations),('phone',f.phone_consultations),('visit',f.visit_consultations),('enrollments',f.enrollments)) v(key,value)
join public.mkt_metrics m on m.workspace_id=f.workspace_id and m.scope='funnel' and m.key=v.key where v.value is not null;
insert into public.mkt_costs(workspace_id,expense_date,category,amount,payment_status,channel_id,content_id,event_id,title,notes,legacy_id,deleted_at)
select workspace_id,expense_date,category,amount,payment_status,
case when content_id is null and event_id is null then channel_id end,
case when event_id is null then content_id end,event_id,coalesce(vendor_name,'기존 비용'),notes,id,deleted_at from public.expenses;

-- Bulk cell saves are atomic and serialized per workspace. NULL means an intentionally cleared cell.
create function public.mkt_save_cells(p_workspace uuid,p_cells jsonb) returns void
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
   do update set amount=excluded.amount,deleted_at=excluded.deleted_at;
  else
   insert into public.mkt_values(workspace_id,metric_id,content_id,promotion_id,metric_date,value)
   values(p_workspace,(cell->>'metric_id')::uuid,(cell->>'content_id')::uuid,(cell->>'promotion_id')::uuid,(cell->>'date')::date,(cell->>'value')::numeric)
   on conflict(workspace_id,metric_id,content_id,promotion_id,metric_date)
   do update set value=excluded.value,deleted_at=null;
  end if;
 end loop;
end; $$;
revoke all on function public.mkt_save_cells(uuid,jsonb) from public,anon;
grant execute on function public.mkt_save_cells(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
