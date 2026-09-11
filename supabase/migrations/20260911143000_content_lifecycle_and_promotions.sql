-- A channel owns its assets. An asset can be organic for most of its life and
-- have one or more paid promotion periods without duplicating the asset.

alter table public.contents
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

create table if not exists public.content_promotions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.contents(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete restrict,
  starts_on date not null,
  ends_on date,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  budget_amount numeric(14,2) check (budget_amount is null or budget_amount >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists content_promotions_content_dates_idx
  on public.content_promotions (workspace_id, content_id, starts_on, ends_on)
  where deleted_at is null;

create trigger content_promotions_set_updated_at
  before update on public.content_promotions
  for each row execute function private.set_updated_at();
create trigger content_promotions_audit
  after insert or update or delete on public.content_promotions
  for each row execute function private.write_audit_log();

alter table public.content_promotions enable row level security;
revoke all on public.content_promotions from anon, authenticated;
grant select, insert, update, delete on public.content_promotions to authenticated;

create policy "content promotions select member" on public.content_promotions
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "content promotions insert member" on public.content_promotions
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy "content promotions update member" on public.content_promotions
  for update to authenticated using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy "content promotions delete member" on public.content_promotions
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));
