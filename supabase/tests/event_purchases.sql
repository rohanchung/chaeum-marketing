begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','852e21eb-5d5c-49de-b69e-071c66f5d39a',true);
do $$
declare ws uuid:='bef296c2-53ff-4865-8222-95bec0098350'; pid uuid; eid uuid; eid2 uuid; rejected boolean;
begin
 insert into public.mkt_purchases(workspace_id,title,purchased_on,quantity,total_amount) values(ws,'__purchase_test__',current_date,500,100000) returning id into pid;
 eid:=public.mkt_save_event_with_items(ws,jsonb_build_object('title','__event_test__','starts_at',now(),'status','completed'),jsonb_build_array(jsonb_build_object('purchase_id',pid,'quantity',150)));
 set constraints all immediate;
 if (select sum(quantity) from public.mkt_event_items where purchase_id=pid and deleted_at is null)<>150 then raise exception 'usage not saved'; end if;
 rejected:=false;
 begin
  perform public.mkt_save_event_with_items(ws,jsonb_build_object('title','__overstock__','starts_at',now(),'status','completed'),jsonb_build_array(jsonb_build_object('purchase_id',pid,'quantity',351)));
 exception when raise_exception then rejected:=true;
 end;
 if not rejected or exists(select 1 from public.marketing_events where workspace_id=ws and title='__overstock__') then raise exception 'atomic overstock guard failed'; end if;
 rejected:=false;
 begin
  update public.mkt_purchases set quantity=149 where id=pid;
 exception when raise_exception then rejected:=true;
 end;
 if not rejected then raise exception 'quantity reduction guard failed'; end if;
 rejected:=false;
 begin
  update public.mkt_purchases set deleted_at=now() where id=pid;
 exception when raise_exception then rejected:=true;
 end;
 if not rejected then raise exception 'purchase delete guard failed'; end if;
 perform public.mkt_save_event_with_items(ws,jsonb_build_object('id',eid,'title','__event_test__','starts_at',now(),'status','completed'),jsonb_build_array(jsonb_build_object('purchase_id',pid,'quantity',100)));
 eid2:=public.mkt_save_event_with_items(ws,jsonb_build_object('title','__event_test2__','starts_at',now(),'status','completed'),jsonb_build_array(jsonb_build_object('purchase_id',pid,'quantity',400)));
 update public.marketing_events set deleted_at=now() where id=eid2;
 if (select sum(quantity) from public.mkt_event_items where purchase_id=pid and deleted_at is null)<>500 then raise exception 'deleted event lost stock'; end if;
 perform public.mkt_save_event_with_items(ws,jsonb_build_object('id',eid2,'title','__event_test2__','starts_at',now(),'status','completed'),'[]');
 if (select sum(quantity) from public.mkt_event_items where purchase_id=pid and deleted_at is null)<>100 then raise exception 'return failed'; end if;
end $$;
rollback;
