alter table public.mkt_work_projects
  add column if not exists color text not null default '#4e986e';

alter table public.mkt_work_projects
  drop constraint if exists mkt_work_projects_color_check;

alter table public.mkt_work_projects
  add constraint mkt_work_projects_color_check
  check (color ~ '^#[0-9A-Fa-f]{6}$');

notify pgrst, 'reload schema';