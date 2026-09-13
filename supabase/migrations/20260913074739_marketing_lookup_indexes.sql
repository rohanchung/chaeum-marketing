-- Workspace-scoped lookups used on every signed-in page.
create index if not exists contents_workspace_channel_idx on public.contents (workspace_id, channel_id);
create index if not exists report_snapshots_workspace_created_idx on public.report_snapshots (workspace_id, created_at);
create index if not exists workspace_members_user_workspace_idx on public.workspace_members (user_id, workspace_id);
