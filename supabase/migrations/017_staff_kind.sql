-- Job category for employees (profiles.role = coach).
-- Used by the employer calendar Role filter: Coach vs Operation Staff.

alter table public.profiles
  add column if not exists staff_kind text not null default 'coach';

alter table public.profiles
  drop constraint if exists profiles_staff_kind_check;

alter table public.profiles
  add constraint profiles_staff_kind_check
  check (staff_kind in ('coach', 'operations'));
