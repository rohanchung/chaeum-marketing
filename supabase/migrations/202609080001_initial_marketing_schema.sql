-- Chaeum Marketing: initial schema
-- Apply through the Supabase SQL editor until the local Supabase CLI is available.
-- This file is intentionally idempotent only at the extension/schema level;
-- migrations must be applied exactly once by Supabase's migration history.

create extension if not exists pgcrypto;
create schema if not exists private;

-- Shared helpers -------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campus_name text not null default '풍무캠퍼스',
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id)
);

-- Membership lookup is private and only callable by signed-in users. It keeps
-- future shared-workspace policies from becoming recursively dependent.
create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Master data ----------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  channel_type text not null default 'other',
  is_active boolean not null default true,
  default_monthly_budget numeric(14,2) check (default_monthly_budget >= 0),
  color text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (workspace_id, name)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  objective text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  start_date date,
  end_date date,
  budget_amount numeric(14,2) check (budget_amount >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date),
  unique (workspace_id, name)
);

create table public.campaign_channels (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (campaign_id, channel_id)
);

create table public.contents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  content_type text not null default 'other',
  status text not null default 'idea' check (status in ('idea', 'in_progress', 'scheduled', 'published', 'archived')),
  published_at timestamptz,
  url text,
  tracking_code text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (workspace_id, tracking_code)
);

create table public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  event_type text not null default 'other',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  audience text,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'cancelled')),
  notion_url text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (ends_at is null or ends_at >= starts_at)
);

-- Daily data used by the date × channel operating sheet. One cell may contain
-- several records when multiple campaigns, contents, or events share a day.
create table public.performance_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_date date not null,
  channel_id uuid not null references public.channels(id) on delete restrict,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_id uuid references public.contents(id) on delete set null,
  event_id uuid references public.marketing_events(id) on delete set null,
  impressions integer check (impressions is null or impressions >= 0),
  inflows integer check (inflows is null or inflows >= 0),
  consultations integer check (consultations is null or consultations >= 0),
  enrollments integer check (enrollments is null or enrollments >= 0),
  data_status text not null default 'confirmed' check (data_status in ('confirmed', 'pending', 'not_run')),
  source_type text not null default 'manual' check (source_type in ('platform_report', 'manual', 'direct_confirmation', 'estimated')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index performance_records_grid_idx
  on public.performance_records (workspace_id, metric_date, channel_id)
  where deleted_at is null;

create table public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  key text not null,
  unit text not null default 'count' check (unit in ('count', 'currency', 'percent', 'text')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (workspace_id, key)
);

create table public.custom_metric_values (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  performance_record_id uuid not null references public.performance_records(id) on delete cascade,
  metric_definition_id uuid not null references public.metric_definitions(id) on delete restrict,
  numeric_value numeric(14,2),
  text_value text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (num_nonnulls(numeric_value, text_value) = 1),
  unique (performance_record_id, metric_definition_id)
);

-- Detailed costs are not duplicated in performance records. The grid sums these
-- rows by date and channel to show each day's spend.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  expense_date date not null,
  category text not null check (category in ('media', 'production', 'goods', 'event', 'agency', 'other')),
  amount numeric(14,2) not null check (amount >= 0),
  budgeted_amount numeric(14,2) check (budgeted_amount is null or budgeted_amount >= 0),
  payment_status text not null default 'paid' check (payment_status in ('planned', 'pending', 'paid', 'cancelled')),
  channel_id uuid references public.channels(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_id uuid references public.contents(id) on delete set null,
  event_id uuid references public.marketing_events(id) on delete set null,
  vendor_name text,
  receipt_path text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);
create index expenses_grid_idx on public.expenses (workspace_id, expense_date, channel_id) where deleted_at is null;

-- Funnel records --------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference_code text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'visit_scheduled', 'visit_completed', 'enrolled', 'on_hold', 'lost')),
  primary_channel_id uuid references public.channels(id) on delete set null,
  primary_campaign_id uuid references public.campaigns(id) on delete set null,
  primary_content_id uuid references public.contents(id) on delete set null,
  primary_event_id uuid references public.marketing_events(id) on delete set null,
  attribution_confidence text not null default 'unknown' check (attribution_confidence in ('direct', 'reported', 'inferred', 'unknown')),
  first_contact_at timestamptz not null default timezone('utc', now()),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);
create index leads_funnel_idx on public.leads (workspace_id, first_contact_at) where deleted_at is null;

create table public.lead_attributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_id uuid references public.contents(id) on delete set null,
  event_id uuid references public.marketing_events(id) on delete set null,
  attribution_role text not null check (attribution_role in ('primary', 'assist')),
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_type text not null check (contact_type in ('kakao', 'phone', 'visit')),
  consulted_at timestamptz not null default timezone('utc', now()),
  outcome text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  enrolled_at timestamptz not null default timezone('utc', now()),
  enrollment_type text not null default 'on_site' check (enrollment_type in ('on_site', 'direct')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.learning_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recorded_on date not null default current_date,
  observation text not null,
  hypothesis text,
  next_action text,
  due_date date,
  result text,
  status text not null default 'open' check (status in ('open', 'testing', 'validated', 'invalidated', 'archived')),
  channel_id uuid references public.channels(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_id uuid references public.contents(id) on delete set null,
  event_id uuid references public.marketing_events(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  period_start date not null,
  period_end date not null,
  filters jsonb not null default '{}'::jsonb,
  snapshot jsonb not null,
  pdf_path text,
  created_at timestamptz not null default timezone('utc', now()),
  check (period_end >= period_start)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index audit_logs_workspace_created_idx on public.audit_logs (workspace_id, created_at desc);

-- Timestamps and audit log ---------------------------------------------------
create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs (workspace_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (
    case
      when tg_table_name = 'workspaces' then nullif(row_data ->> 'id', '')::uuid
      else nullif(row_data ->> 'workspace_id', '')::uuid
    end,
    auth.uid(),
    tg_table_name,
    nullif(row_data ->> 'id', '')::uuid,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.write_audit_log() from public;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'workspaces','profiles','channels','campaigns','contents','marketing_events',
    'performance_records','metric_definitions','custom_metric_values','expenses',
    'leads','consultations','enrollments','learning_records','campaign_channels','lead_attributions'
  ] loop
    if table_name not in ('campaign_channels', 'lead_attributions') then
      execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', table_name || '_set_updated_at', table_name);
    end if;
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.write_audit_log()', table_name || '_audit', table_name);
  end loop;
end;
$$;

-- Every new Auth user receives an isolated workspace. Disable public sign-up
-- in Supabase Auth and create the one permitted user from the Auth dashboard.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare new_workspace_id uuid;
begin
  insert into public.workspaces (name, owner_id)
  values (coalesce(new.raw_user_meta_data ->> 'workspace_name', '채움영어학원 마케팅'), new.id)
  returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, new.id, 'owner');
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- The sole app user was created before this migration, so bootstrap their
-- workspace once. Later Auth users use the trigger above.
do $$
declare bootstrap_user_id uuid; bootstrap_workspace_id uuid;
begin
  select id into bootstrap_user_id from auth.users where email = 'bhj9528@gmail.com';
  if bootstrap_user_id is not null and not exists (select 1 from public.workspaces where owner_id = bootstrap_user_id) then
    insert into public.workspaces (name, owner_id) values ('채움영어학원 마케팅', bootstrap_user_id) returning id into bootstrap_workspace_id;
    insert into public.workspace_members (workspace_id, user_id, role) values (bootstrap_workspace_id, bootstrap_user_id, 'owner');
    insert into public.profiles (id) values (bootstrap_user_id) on conflict do nothing;
  end if;
end;
$$;

-- Security -------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;

revoke all on public.workspaces, public.workspace_members, public.profiles from anon, authenticated;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, update on public.profiles to authenticated;

create policy "members view workspace" on public.workspaces for select to authenticated using ((select private.is_workspace_member(id)));
create policy "owners update workspace" on public.workspaces for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "members view memberships" on public.workspace_members for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "users view own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'channels','campaigns','campaign_channels','contents','marketing_events',
    'performance_records','metric_definitions','custom_metric_values','expenses',
    'leads','lead_attributions','consultations','enrollments','learning_records','report_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_workspace_member(workspace_id)))', table_name || '_select_member', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_workspace_member(workspace_id)))', table_name || '_insert_member', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)))', table_name || '_update_member', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_workspace_member(workspace_id)))', table_name || '_delete_member', table_name);
  end loop;
end;
$$;

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
create policy "members view audit logs" on public.audit_logs for select to authenticated using ((select private.is_workspace_member(workspace_id)));

-- Private trigger functions are never exposed through the Data API.
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
