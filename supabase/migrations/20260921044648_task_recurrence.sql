-- Rohan Marketing: recurring task rules and per-occurrence completion history.

alter table public.mkt_tasks
  add column if not exists recurrence_frequency text
    check (recurrence_frequency is null or recurrence_frequency in ('daily', 'weekly', 'monthly')),
  add column if not exists recurrence_interval integer not null default 1
    check (recurrence_interval > 0),
  add column if not exists recurrence_weekday smallint
    check (recurrence_weekday is null or recurrence_weekday between 0 and 6),
  add column if not exists recurrence_until date,
  add column if not exists recurrence_next_on date,
  add column if not exists recurrence_active boolean not null default false;

create table public.mkt_task_occurrences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.mkt_tasks(id) on delete cascade,
  occurrence_on date not null,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  completed_at timestamptz,
  result text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, task_id, occurrence_on)
);

create index mkt_task_occurrences_task_idx
  on public.mkt_task_occurrences (workspace_id, task_id, occurrence_on);

create trigger mkt_task_occurrences_set_updated_at
  before update on public.mkt_task_occurrences
  for each row execute function private.set_updated_at();
create trigger mkt_task_occurrences_audit
  after insert or update or delete on public.mkt_task_occurrences
  for each row execute function private.write_audit_log();

alter table public.mkt_task_occurrences enable row level security;
revoke all on public.mkt_task_occurrences from anon, authenticated;
grant select, insert, update, delete on public.mkt_task_occurrences to authenticated;
create policy mkt_task_occurrences_select_member on public.mkt_task_occurrences
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy mkt_task_occurrences_insert_member on public.mkt_task_occurrences
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_task_occurrences_update_member on public.mkt_task_occurrences
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_task_occurrences_delete_member on public.mkt_task_occurrences
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

notify pgrst, 'reload schema';
