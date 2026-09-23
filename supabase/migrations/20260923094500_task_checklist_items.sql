-- Rohan Marketing: compact process checklists that belong to one task card.

create table public.mkt_task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.mkt_tasks(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index mkt_task_checklist_items_task_idx
  on public.mkt_task_checklist_items (workspace_id, task_id, sort_order)
  where deleted_at is null;

create trigger mkt_task_checklist_items_set_updated_at
  before update on public.mkt_task_checklist_items
  for each row execute function private.set_updated_at();
create trigger mkt_task_checklist_items_audit
  after insert or update or delete on public.mkt_task_checklist_items
  for each row execute function private.write_audit_log();

alter table public.mkt_task_checklist_items enable row level security;
revoke all on public.mkt_task_checklist_items from anon, authenticated;
grant select, insert, update, delete on public.mkt_task_checklist_items to authenticated;

create policy mkt_task_checklist_items_select_member on public.mkt_task_checklist_items
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy mkt_task_checklist_items_insert_member on public.mkt_task_checklist_items
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_task_checklist_items_update_member on public.mkt_task_checklist_items
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy mkt_task_checklist_items_delete_member on public.mkt_task_checklist_items
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

notify pgrst, 'reload schema';
