-- Reorder only the six unmodified positions from the earlier automatic seed.
update public.mkt_metrics m set sort_order=t.target_order
from public.channels c, (values ('impressions',20,0),('clicks',21,1),('reactions',22,2),('ctr',23,7),('cpc',24,8),('reactionCost',25,9)) t(key,old_order,target_order)
where m.channel_id=c.id and c.measurement_template='paid_ad' and m.scope='paid' and m.key=t.key and m.sort_order=t.old_order and m.deleted_at is null;
