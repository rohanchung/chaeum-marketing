-- Rohan Marketing: task dates and one-step dependency links.

alter table public.mkt_tasks
  add column if not exists depends_on_task_id uuid references public.mkt_tasks(id) on delete set null;

alter table public.mkt_tasks
  add constraint mkt_tasks_no_self_dependency
  check (depends_on_task_id is null or depends_on_task_id <> id);

create index if not exists mkt_tasks_dependency_idx
  on public.mkt_tasks (workspace_id, depends_on_task_id)
  where depends_on_task_id is not null and deleted_at is null;

notify pgrst, 'reload schema';
