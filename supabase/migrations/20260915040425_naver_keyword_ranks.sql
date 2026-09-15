alter table public.mkt_metrics drop constraint mkt_metrics_unit_check;
alter table public.mkt_metrics add constraint mkt_metrics_unit_check check(unit in ('count','currency','percent','rank'));
alter table public.mkt_metrics add constraint mkt_rank_shape check(unit <> 'rank' or (scope='total' and mode='latest' and not include_in_marketing and funnel_role is null));
alter table public.contents add column keyword_metric_ids uuid[];
comment on column public.contents.keyword_metric_ids is 'NULL displays all rank definitions; explicit array selects keyword rows without deleting observations.';
create function private.guard_keyword_rank() returns trigger language plpgsql set search_path='' as $$
declare m public.mkt_metrics; c public.contents;
begin
 if tg_table_name='mkt_values' then
  select * into strict m from public.mkt_metrics where id=new.metric_id and workspace_id=new.workspace_id;
  if new.content_id is not null then select * into strict c from public.contents where id=new.content_id and workspace_id=new.workspace_id; end if;
  if m.unit='rank' then
   if c.content_type is distinct from 'search_keyword' or new.promotion_id is not null then raise exception '순위는 키워드에 기록하세요.'; end if;
   if new.value is not null and (new.value='NaN'::numeric or new.value<0 or new.value<>trunc(new.value)) then raise exception '순위는 정수로 입력하세요.'; end if;
  elsif c.content_type='search_keyword' then raise exception '키워드에는 순위 지표만 기록하세요.';
  end if;
 elsif tg_table_name='contents' then
  if tg_op='UPDATE' and new.content_type is distinct from old.content_type and exists(select 1 from public.mkt_values where content_id=new.id) then
   if new.content_type='search_keyword' or old.content_type='search_keyword' then raise exception '입력 기록이 있는 키워드의 형식은 변경할 수 없습니다.'; end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_keyword_rank() from public;
create trigger keyword_rank before insert or update on public.mkt_values for each row execute function private.guard_keyword_rank();
create trigger keyword_kind before update on public.contents for each row execute function private.guard_keyword_rank();
-- Definitions and a user-requested keyword only; no fabricated rankings.
insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,unit,mode,sort_order)
select c.workspace_id,c.id,m.key,m.name,'total','rank','latest',m.ord
from public.channels c cross join (values
 ('keywordRankMobilePlace','모바일 · 플레이스 순위',100),
 ('keywordRankPcPlace','PC · 플레이스 순위',101),
 ('keywordRankMobileWeb','모바일 · 홈페이지 순위',102),
 ('keywordRankPcWeb','PC · 홈페이지 순위',103)
) m(key,name,ord)
where c.name like '네이버%' and c.deleted_at is null
on conflict(workspace_id,channel_id,scope,key) do nothing;
insert into public.contents(workspace_id,channel_id,title,content_type,status)
select c.workspace_id,c.id,'풍무동 채움영어','search_keyword','published'
from public.channels c where c.name like '네이버%' and c.deleted_at is null
and not exists(select 1 from public.contents x where x.channel_id=c.id and x.content_type='search_keyword' and x.title='풍무동 채움영어');
update public.channels set name='네이버' where name='네이버 블로그' and deleted_at is null;
notify pgrst,'reload schema';
