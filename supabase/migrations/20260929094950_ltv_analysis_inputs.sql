-- Rohan Marketing: inputs for long-term (LTV / CAC) analysis.
-- All new columns are nullable so existing rows and older JSON backups restore unchanged.

-- Per-student monthly tuition and withdrawal date (retention is measured from these).
alter table public.mkt_customers
  add column if not exists monthly_fee numeric
    check (monthly_fee is null or (monthly_fee >= 0 and monthly_fee <> 'NaN'::numeric)),
  add column if not exists withdrawn_on date;
alter table public.mkt_customers
  add constraint mkt_customers_withdrawn_after_enrolled
  check (withdrawn_on is null or (enrolled_on is not null and withdrawn_on >= enrolled_on));

-- Cost purpose: null means acquisition, the default for marketing spend.
alter table public.mkt_costs
  add column if not exists cost_purpose text
    check (cost_purpose is null or cost_purpose in ('acquisition', 'launch', 'retention'));

-- One row of analysis assumptions per workspace. Absent row = app defaults.
create table public.mkt_ltv_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  contribution_rate numeric not null default 0.4 check (contribution_rate > 0 and contribution_rate <= 1),
  retention_months numeric not null default 6 check (retention_months > 0 and retention_months <= 120),
  ltv_cap_months integer not null default 24 check (ltv_cap_months > 0 and ltv_cap_months <= 120),
  target_ratio numeric not null default 3 check (target_ratio > 0),
  target_payback_months numeric not null default 3 check (target_payback_months > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create trigger mkt_ltv_settings_set_updated_at
  before update on public.mkt_ltv_settings
  for each row execute function private.set_updated_at();
create trigger mkt_ltv_settings_audit
  after insert or update or delete on public.mkt_ltv_settings
  for each row execute function private.write_audit_log();

alter table public.mkt_ltv_settings enable row level security;
revoke all on public.mkt_ltv_settings from anon, authenticated;
grant select, insert, update on public.mkt_ltv_settings to authenticated;
-- Members read; like other master records, only owners and editors change assumptions.
create policy mkt_ltv_settings_select_member on public.mkt_ltv_settings
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy editor_insert on public.mkt_ltv_settings
  for insert to authenticated with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = mkt_ltv_settings.workspace_id
      and wm.user_id = (select auth.uid()) and wm.role in ('owner', 'editor')));
create policy editor_update on public.mkt_ltv_settings
  for update to authenticated using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = mkt_ltv_settings.workspace_id
      and wm.user_id = (select auth.uid()) and wm.role in ('owner', 'editor')))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = mkt_ltv_settings.workspace_id
      and wm.user_id = (select auth.uid()) and wm.role in ('owner', 'editor')));

notify pgrst, 'reload schema';
