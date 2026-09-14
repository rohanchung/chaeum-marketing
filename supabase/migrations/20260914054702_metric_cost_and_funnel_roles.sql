alter table public.mkt_metrics add column include_in_marketing boolean not null default false;
alter table public.mkt_metrics add column funnel_role text;
alter table public.mkt_metrics add constraint mkt_metric_cost_mode check (not include_in_marketing or (unit='currency' and mode='daily'));
alter table public.mkt_metrics add constraint mkt_metric_funnel_role check (funnel_role is null or (scope='funnel' and unit='count' and funnel_role in ('inflows','consultations','enrollments')));
update public.mkt_metrics set funnel_role=case when key='inflows' or name='설명회 신청' then 'inflows' when key in ('kakao','phone','visit') or name='당근 상담' then 'consultations' when key='enrollments' then 'enrollments' end where scope='funnel' and unit='count';
update public.mkt_metrics m set include_in_marketing=true from public.channels c where c.id=m.channel_id and c.workspace_id=m.workspace_id and c.name='미디어·바이럴' and m.name='비용' and m.unit='currency' and m.mode='daily' and m.deleted_at is null;
