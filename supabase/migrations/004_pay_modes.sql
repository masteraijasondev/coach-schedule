-- Pay modes: per_student (PT), per_head (MIIT), per_session (PTA/Admin)

create type public.pay_mode as enum ('per_student', 'per_head', 'per_session');

alter table public.lesson_types
  add column if not exists pay_mode public.pay_mode not null default 'per_session';

alter table public.lessons
  add column if not exists headcount integer check (headcount is null or headcount > 0);

create table if not exists public.coach_student_rates (
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  amount_hkd numeric(10, 2) not null check (amount_hkd >= 0),
  primary key (coach_id, student_id)
);

alter table public.coach_student_rates enable row level security;

create policy "coach_student_rates_select"
  on public.coach_student_rates for select
  using (coach_id = auth.uid() or public.is_employer());

create policy "coach_student_rates_employer_write"
  on public.coach_student_rates for all
  using (public.is_employer())
  with check (public.is_employer());

grant select, insert, update, delete on public.coach_student_rates to authenticated;
