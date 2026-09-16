begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare mid uuid; before_values jsonb; after_values jsonb; rejected boolean;
begin
 select id into strict mid from public.mkt_metrics where key='bizProfileRegulars' and workspace_id='bef296c2-53ff-4865-8222-95bec0098350';
 select jsonb_agg(to_jsonb(v) order by id) into before_values from public.mkt_values v where metric_id=mid;
 update public.mkt_metrics set mode='latest' where id=mid;
 if (select mode from public.mkt_metrics where id=mid)<>'latest' then raise exception 'latest not saved'; end if;
 update public.mkt_metrics set mode='cumulative' where id=mid;
 update public.mkt_metrics set mode='daily' where id=mid;
 select jsonb_agg(to_jsonb(v) order by id) into after_values from public.mkt_values v where metric_id=mid;
 if before_values is distinct from after_values then raise exception 'raw records changed'; end if;
 rejected:=false;
 begin update public.mkt_metrics set unit='currency' where id=mid;
 exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'unsafe unit conversion accepted'; end if;
 rejected:=false;
 begin update public.mkt_metrics set mode='ratio',numerator='a',denominator='b' where id=mid;
 exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'raw records hidden by ratio'; end if;
end $$;
rollback;
