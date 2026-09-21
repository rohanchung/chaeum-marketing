-- Rohan Marketing: work areas, projects, and actionable tasks.
-- This domain is separate from marketing measurements and never changes KPI totals.

create table public.mkt_work_areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (workspace_id, name)
);

create table public.mkt_work_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  area_id uuid not null references public.mkt_work_areas(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  start_on date,
  due_on date,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (due_on is null or start_on is null or due_on >= start_on),
  unique (workspace_id, area_id, name)
);

create table public.mkt_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  area_id uuid references public.mkt_work_areas(id) on delete set null,
  project_id uuid references public.mkt_work_projects(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text,
  result text,
  next_action text,
  source_type text not null default 'self' check (source_type in ('self', 'requested', 'recurring')),
  requester_name text,
  requested_on date,
  request_note text,
  status text not null default 'planned' check (status in ('requested', 'planned', 'in_progress', 'waiting', 'on_hold', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  start_at timestamptz,
  due_at timestamptz,
  remind_at timestamptz,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (due_at is null or start_at is null or due_at >= start_at),
  check (source_type <> 'requested' or requester_name is not null and length(trim(requester_name)) > 0),
  check (status <> 'done' or completed_at is not null)
);

create table public.mkt_work_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.mkt_work_projects(id) on delete cascade,
  task_id uuid references public.mkt_tasks(id) on delete cascade,
  entity_type text not null check (entity_type in ('channel', 'content', 'promotion', 'event', 'purchase')),
  entity_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  check (num_nonnulls(project_id, task_id) = 1),
  unique (workspace_id, project_id, task_id, entity_type, entity_id)
);

create index mkt_work_projects_area_idx
  on public.mkt_work_projects (workspace_id, area_id, sort_order)
  where deleted_at is null;
create index mkt_tasks_today_idx
  on public.mkt_tasks (workspace_id, due_at, start_at, status)
  where deleted_at is null;
create index mkt_tasks_project_idx
  on public.mkt_tasks (workspace_id, project_id, sort_order)
  where deleted_at is null;
create index mkt_work_links_project_idx
  on public.mkt_work_links (workspace_id, project_id)
  where project_id is not null;
create index mkt_work_links_task_idx
  on public.mkt_work_links (workspace_id, task_id)
  where task_id is not null;

create trigger mkt_work_areas_set_updated_at
  before update on public.mkt_work_areas
  for each row execute function private.set_updated_at();
create trigger mkt_work_projects_set_updated_at
  before update on public.mkt_work_projects
  for each row execute function private.set_updated_at();
create trigger mkt_tasks_set_updated_at
  before update on public.mkt_tasks
  for each row execute function private.set_updated_at();
create trigger mkt_work_areas_audit
  after insert or update or delete on public.mkt_work_areas
  for each row execute function private.write_audit_log();
create trigger mkt_work_projects_audit
  after insert or update or delete on public.mkt_work_projects
  for each row execute function private.write_audit_log();
create trigger mkt_tasks_audit
  after insert or update or delete on public.mkt_tasks
  for each row execute function private.write_audit_log();

alter table public.mkt_work_areas enable row level security;
alter table public.mkt_work_projects enable row level security;
alter table public.mkt_tasks enable row level security;
alter table public.mkt_work_links enable row level security;
revoke all on public.mkt_work_areas, public.mkt_work_projects, public.mkt_tasks, public.mkt_work_links from anon, authenticated;
grant select, insert, update, delete on public.mkt_work_areas, public.mkt_work_projects, public.mkt_tasks, public.mkt_work_links to authenticated;

create policy mkt_work_areas_select_member on public.mkt_work_areas
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_areas_insert_member on public.mkt_work_areas
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_areas_update_member on public.mkt_work_areas
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_areas_delete_member on public.mkt_work_areas
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy mkt_work_projects_select_member on public.mkt_work_projects
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_projects_insert_member on public.mkt_work_projects
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_projects_update_member on public.mkt_work_projects
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_projects_delete_member on public.mkt_work_projects
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy mkt_tasks_select_member on public.mkt_tasks
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy mkt_tasks_insert_member on public.mkt_tasks
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_tasks_update_member on public.mkt_tasks
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_tasks_delete_member on public.mkt_tasks
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy mkt_work_links_select_member on public.mkt_work_links
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_links_insert_member on public.mkt_work_links
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_links_update_member on public.mkt_work_links
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_work_links_delete_member on public.mkt_work_links
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

insert into public.mkt_work_areas (workspace_id, name, description, color, sort_order)
select w.id, '채움영어 풍무캠퍼스 마케팅', '마케팅·행사·콘텐츠 운영 업무', '#287a56', 0
from public.workspaces w
where w.deleted_at is null
  and not exists (
    select 1 from public.mkt_work_areas a
    where a.workspace_id = w.id and a.name = '채움영어 풍무캠퍼스 마케팅'
  );

notify pgrst, 'reload schema';
