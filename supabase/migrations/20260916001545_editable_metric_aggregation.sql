-- Keep observation identities stable, but permit changing how raw values are aggregated.
do $$
declare def text; old_guard text := $old$
  if tg_op='UPDATE' and (new.mode,new.scope,new.channel_id,new.key,new.unit,new.numerator,new.denominator,new.multiplier)
      is distinct from (old.mode,old.scope,old.channel_id,old.key,old.unit,old.numerator,old.denominator,old.multiplier)
      and exists(select 1 from public.mkt_values where metric_id=old.id) then
    raise exception '기록이 있는 지표의 측정 의미는 변경할 수 없습니다. 새 지표를 만드세요.';
  end if;$old$;
new_guard text := $new$
  if tg_op='UPDATE' and exists(select 1 from public.mkt_values where metric_id=old.id) then
    if (new.scope,new.channel_id,new.key,new.unit,new.numerator,new.denominator,new.multiplier)
       is distinct from (old.scope,old.channel_id,old.key,old.unit,old.numerator,old.denominator,old.multiplier) then
      raise exception '기록이 있는 지표의 연결 대상·단위는 변경할 수 없습니다. 집계 방식은 수정할 수 있습니다.';
    end if;
    if new.mode='ratio' and old.mode<>'ratio' then
      raise exception '직접 입력 기록은 보존해야 합니다. 계산식은 별도 지표로 추가하세요.';
    end if;
  end if;$new$;
begin
 select pg_get_functiondef('private.validate_mkt_row()'::regprocedure) into def;
 if position(old_guard in def)=0 then raise exception '현재 검증 규칙을 확인하세요.'; end if;
 execute replace(def,old_guard,new_guard);
end $$;
-- The owner confirmed these values are daily new regulars (1 + 2 + 1), not total snapshots.
update public.mkt_metrics set mode='daily'
where key='bizProfileRegulars' and unit='count' and mode='latest';
notify pgrst,'reload schema';
