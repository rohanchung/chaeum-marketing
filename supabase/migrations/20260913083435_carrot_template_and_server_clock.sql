-- Carrot is an advertising template, not an empty custom channel.
update public.channels set measurement_template='paid_ad'
where name='당근 광고' and measurement_template='custom' and deleted_at is null;

insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope,mode,unit,numerator,denominator,multiplier,sort_order)
select c.workspace_id,c.id,t.key,t.name,'paid',t.mode,t.unit,t.numerator,t.denominator,t.multiplier,t.sort_order
from public.channels c cross join (values
('impressions','노출수','daily','count',null::text,null::text,100,0),
('clicks','클릭수','daily','count',null,null,100,1),
('reactions','반응수','daily','count',null,null,100,2),
('paidReach','도달','latest','count',null,null,100,3),
('regulars','단골','daily','count',null,null,100,4),
('interests','관심','daily','count',null,null,100,5),
('couponDownloads','쿠폰 다운로드','daily','count',null,null,100,6),
('ctr','클릭률','ratio','percent','clicks','impressions',100,7),
('cpc','클릭당 비용','ratio','currency','$spend','clicks',1,8),
('reactionCost','반응당 비용','ratio','currency','$spend','reactions',1,9)
) t(key,name,mode,unit,numerator,denominator,multiplier,sort_order)
where c.measurement_template='paid_ad' and c.deleted_at is null
on conflict(workspace_id,channel_id,scope,key) do nothing;

-- Read-only clock: always determine today in Korean time on the server.
create function public.mkt_server_clock() returns jsonb
language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('server_now',clock_timestamp(),'today',(clock_timestamp() at time zone 'Asia/Seoul')::date,'timezone','Asia/Seoul');
$$;
revoke all on function public.mkt_server_clock() from public,anon;
grant execute on function public.mkt_server_clock() to authenticated;

-- A failure creating the promotion must also roll back the new content.
create function public.mkt_create_ad_content(p_workspace uuid,p_content jsonb,p_promotion jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare cid uuid; ch uuid := (p_content->>'channel_id')::uuid;
begin
 if not private.is_workspace_member(p_workspace) then raise exception '접근 권한이 없습니다.'; end if;
 if not exists(select 1 from public.channels where id=ch and workspace_id=p_workspace and deleted_at is null and measurement_template in ('paid_ad','search_ad')) then
   raise exception '광고 템플릿 채널을 선택하세요.';
 end if;
 if coalesce(btrim(p_content->>'title'),'')='' then raise exception '소재 제목을 입력하세요.'; end if;
 if nullif(p_promotion->>'start_date','') is null or nullif(p_promotion->>'end_date','') is null
   or (p_promotion->>'start_date')::date > (p_promotion->>'end_date')::date then
   raise exception '광고 시작일과 종료일을 확인하세요.';
 end if;
 insert into public.contents(workspace_id,channel_id,title,content_type,published_at,url,status,notes)
 values(p_workspace,ch,p_content->>'title','ad_creative',nullif(p_content->>'published_at','')::timestamptz,nullif(p_content->>'url',''),'published',nullif(p_content->>'notes',''))
 returning id into cid;
 insert into public.mkt_promotions(workspace_id,content_id,title,start_date,end_date)
 values(p_workspace,cid,coalesce(nullif(p_promotion->>'title',''),(p_content->>'title')||' 광고'),(p_promotion->>'start_date')::date,(p_promotion->>'end_date')::date);
 return cid;
end; $$;
revoke all on function public.mkt_create_ad_content(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.mkt_create_ad_content(uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
