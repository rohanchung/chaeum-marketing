begin;
do $$ declare ws uuid;begin
 insert into public.workspaces(name,owner_id) values('__검증용 격리 작업공간','852e21eb-5d5c-49de-b69e-071c66f5d39a') returning id into ws;
 insert into public.channels(workspace_id,name) values(ws,'__검증용 격리 채널');
end $$;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
set local role authenticated;
do $$ declare denied boolean:=false;begin
 if exists(select 1 from public.channels where name='__검증용 격리 채널') then raise exception 'Cross workspace read leaked';end if;
 begin insert into public.mkt_metrics(workspace_id,channel_id,key,name,scope) values('bef296c2-53ff-4865-8222-95bec0098350','00000000-0000-4000-8000-000000000001','foreign','test','total');exception when foreign_key_violation then denied:=true;end;
 if not denied then raise exception 'Composite workspace FK failed';end if;
end $$;
reset role;
update public.workspace_members set role='viewer' where workspace_id='bef296c2-53ff-4865-8222-95bec0098350' and user_id='852e21eb-5d5c-49de-b69e-071c66f5d39a';
set local role authenticated;
do $$ declare denied boolean:=false;begin
 if not exists(select 1 from public.channels) then raise exception 'Viewer read failed';end if;
 begin insert into public.mkt_customers(workspace_id,reference_code,consulted_on) values('bef296c2-53ff-4865-8222-95bec0098350','__viewer','2026-09-01');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Viewer write allowed';end if;
 denied:=false;begin perform public.mkt_save_channel('bef296c2-53ff-4865-8222-95bec0098350','{"name":"__viewer channel"}','[]');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Viewer master write allowed';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin if exists(select 1 from public.mkt_metrics) or exists(select 1 from public.channels) then raise exception 'Outsider read leaked';end if;end $$;
reset role;
set local role anon;
do $$ declare denied boolean:=false;begin
 begin perform count(*) from public.mkt_metrics;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous table access allowed';end if;
 denied:=false;begin perform public.mkt_save_cells('bef296c2-53ff-4865-8222-95bec0098350','[]');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous RPC access allowed';end if;
end $$;
rollback;
select 'PASS: cross-workspace isolation, composite FK, viewer read-only, outsider denial, anonymous table/RPC denial' result;
