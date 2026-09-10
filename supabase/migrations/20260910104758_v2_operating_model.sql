-- v2: separate academy-wide daily funnel from attributed channel performance.
-- Channels remain ongoing acquisition routes. Contents are channel children and
-- events are independent one-off marketing occurrences.

alter table public.contents
  add column if not exists channel_id uuid references public.channels(id) on delete set null,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

alter table public.channels
  add column if not exists measurement_template text not null default 'custom'
  check (measurement_template in ('paid_ad', 'social_content', 'blog_content', 'search_ad', 'event', 'referral', 'custom'));

alter table public.metric_definitions
  add column if not exists aggregation_method text not null default 'sum'
  check (aggregation_method in ('sum', 'max', 'average', 'latest')),
  add column if not exists input_scope text not null default 'channel_content'
  check (input_scope in ('daily_funnel', 'channel_content', 'event'));

create table public.channel_metric_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  metric_definition_id uuid not null references public.metric_definitions(id) on delete cascade,
  display_order integer not null default 0,
  is_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (channel_id, metric_definition_id)
);
create index channel_metric_profiles_channel_idx
  on public.channel_metric_profiles (workspace_id, channel_id, display_order)
  where is_active = true;

create index if not exists contents_workspace_channel_idx
  on public.contents (workspace_id, channel_id)
  where deleted_at is null;

create table public.daily_funnel_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_date date not null,
  inflows integer check (inflows is null or inflows >= 0),
  kakao_consultations integer check (kakao_consultations is null or kakao_consultations >= 0),
  phone_consultations integer check (phone_consultations is null or phone_consultations >= 0),
  visit_consultations integer check (visit_consultations is null or visit_consultations >= 0),
  enrollments integer check (enrollments is null or enrollments >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (workspace_id, metric_date)
);
create index daily_funnel_records_month_idx
  on public.daily_funnel_records (workspace_id, metric_date)
  where deleted_at is null;

create table public.event_metric_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null references public.marketing_events(id) on delete cascade,
  metric_date date not null,
  inquiries integer check (inquiries is null or inquiries >= 0),
  attendees integer check (attendees is null or attendees >= 0),
  inflows integer check (inflows is null or inflows >= 0),
  direct_cost numeric(14,2) check (direct_cost is null or direct_cost >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (event_id, metric_date)
);
create index event_metric_records_month_idx
  on public.event_metric_records (workspace_id, metric_date, event_id)
  where deleted_at is null;

create trigger daily_funnel_records_set_updated_at
  before update on public.daily_funnel_records
  for each row execute function private.set_updated_at();
create trigger event_metric_records_set_updated_at
  before update on public.event_metric_records
  for each row execute function private.set_updated_at();
create trigger daily_funnel_records_audit
  after insert or update or delete on public.daily_funnel_records
  for each row execute function private.write_audit_log();
create trigger event_metric_records_audit
  after insert or update or delete on public.event_metric_records
  for each row execute function private.write_audit_log();
create trigger channel_metric_profiles_set_updated_at
  before update on public.channel_metric_profiles
  for each row execute function private.set_updated_at();
create trigger channel_metric_profiles_audit
  after insert or update or delete on public.channel_metric_profiles
  for each row execute function private.write_audit_log();

alter table public.daily_funnel_records enable row level security;
alter table public.event_metric_records enable row level security;
alter table public.channel_metric_profiles enable row level security;
revoke all on public.daily_funnel_records, public.event_metric_records, public.channel_metric_profiles from anon, authenticated;
grant select, insert, update, delete on public.daily_funnel_records, public.event_metric_records, public.channel_metric_profiles to authenticated;

create policy "daily funnel select member" on public.daily_funnel_records
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "daily funnel insert member" on public.daily_funnel_records
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy "daily funnel update member" on public.daily_funnel_records
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy "daily funnel delete member" on public.daily_funnel_records
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy "event metrics select member" on public.event_metric_records
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "event metrics insert member" on public.event_metric_records
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy "event metrics update member" on public.event_metric_records
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy "event metrics delete member" on public.event_metric_records
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy "channel metric profiles select member" on public.channel_metric_profiles
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "channel metric profiles insert member" on public.channel_metric_profiles
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy "channel metric profiles update member" on public.channel_metric_profiles
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy "channel metric profiles delete member" on public.channel_metric_profiles
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));
