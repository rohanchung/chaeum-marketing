alter table public.mkt_metrics drop constraint mkt_metrics_scope_check;
alter table public.mkt_metrics add constraint mkt_metrics_scope_check check(scope in ('funnel','channel','total','organic','paid'));
do $$
declare definition text;
begin
 select pg_get_functiondef('private.validate_mkt_row()'::regprocedure) into definition;
 if position('if m.scope=''funnel'' then' in definition)=0 then raise exception 'Unexpected validation function'; end if;
 definition := replace(definition, 'if m.scope=''funnel'' then', 'if m.scope in (''funnel'',''channel'') then');
 definition := replace(definition, '학원 지표의 대상이 올바르지 않습니다.', '학원·채널 전체 지표에는 소재나 집행을 연결하지 마세요.');
 execute definition;
end $$;
update public.mkt_metrics m set scope='channel'
from public.channels c where c.id=m.channel_id and c.workspace_id=m.workspace_id
and lower(c.name) in ('비틀리','bitly','홈페이지','웹사이트')
and m.scope='total' and m.deleted_at is null
and not exists(select 1 from public.contents x where x.channel_id=c.id and x.deleted_at is null)
and not exists(select 1 from public.mkt_values v where v.metric_id=m.id);
