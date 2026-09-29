alter table public.profiles
  add column if not exists active boolean not null default true;
