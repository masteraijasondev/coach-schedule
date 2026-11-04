-- Mark availability rows auto-created by employer 直接派更 so revoke can remove them.

alter table public.staff_availabilities
  add column if not exists auto_for_assign boolean not null default false;

create index if not exists staff_availabilities_auto_for_assign_idx
  on public.staff_availabilities (coach_id, available_date)
  where auto_for_assign;
