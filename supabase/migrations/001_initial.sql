-- Coaching schedule & salary (single-company)
-- Timezone assumption: Asia/Hong_Kong; currency: HKD

create extension if not exists "pgcrypto";

create type public.user_role as enum ('employer', 'coach');
create type public.lesson_status as enum ('open', 'assigned', 'completed', 'cancelled');
create type public.request_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.user_role not null,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.lesson_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_duration_minutes integer not null default 60 check (default_duration_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.coach_rates (
  coach_id uuid not null references public.profiles (id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types (id) on delete cascade,
  amount_hkd numeric(10, 2) not null check (amount_hkd >= 0),
  primary key (coach_id, lesson_type_id)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_type_id uuid not null references public.lesson_types (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.lesson_status not null default 'open',
  coach_id uuid references public.profiles (id),
  earned_amount_hkd numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  constraint lessons_time_valid check (ends_at > starts_at),
  constraint lessons_open_no_coach check (
    status <> 'open' or coach_id is null
  ),
  constraint lessons_assigned_has_coach check (
    status <> 'assigned' or coach_id is not null
  ),
  constraint lessons_completed_has_coach check (
    status <> 'completed' or (coach_id is not null and earned_amount_hkd is not null)
  )
);

create table public.lesson_students (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  primary key (lesson_id, student_id)
);

create table public.lesson_requests (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (lesson_id, coach_id)
);

create index lessons_starts_at_idx on public.lessons (starts_at);
create index lessons_coach_id_idx on public.lessons (coach_id);
create index lessons_status_idx on public.lessons (status);
create index lesson_requests_lesson_id_idx on public.lesson_requests (lesson_id);

-- Helpers
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_employer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'employer'
  );
$$;

create or replace function public.coach_has_overlap(
  p_coach_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_lesson_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lessons l
    where l.coach_id = p_coach_id
      and l.status <> 'cancelled'
      and (p_exclude_lesson_id is null or l.id <> p_exclude_lesson_id)
      and l.starts_at < p_ends_at
      and l.ends_at > p_starts_at
  );
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.lesson_types enable row level security;
alter table public.coach_rates enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_students enable row level security;
alter table public.lesson_requests enable row level security;

-- profiles
create policy "profiles_select_own_or_employer"
  on public.profiles for select
  using (id = auth.uid() or public.is_employer());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_employer_update_coaches"
  on public.profiles for update
  using (public.is_employer())
  with check (public.is_employer());

create policy "profiles_employer_insert"
  on public.profiles for insert
  with check (public.is_employer() or id = auth.uid());

-- students
create policy "students_select_authenticated"
  on public.students for select
  to authenticated
  using (true);

create policy "students_employer_write"
  on public.students for all
  using (public.is_employer())
  with check (public.is_employer());

-- lesson_types
create policy "lesson_types_select_authenticated"
  on public.lesson_types for select
  to authenticated
  using (true);

create policy "lesson_types_employer_write"
  on public.lesson_types for all
  using (public.is_employer())
  with check (public.is_employer());

-- coach_rates
create policy "coach_rates_select_own_or_employer"
  on public.coach_rates for select
  using (coach_id = auth.uid() or public.is_employer());

create policy "coach_rates_employer_write"
  on public.coach_rates for all
  using (public.is_employer())
  with check (public.is_employer());

-- lessons
create policy "lessons_select_employer_own_or_open"
  on public.lessons for select
  using (
    public.is_employer()
    or status = 'open'
    or coach_id = auth.uid()
  );

create policy "lessons_employer_insert"
  on public.lessons for insert
  with check (public.is_employer());

create policy "lessons_employer_update"
  on public.lessons for update
  using (public.is_employer())
  with check (public.is_employer());

create policy "lessons_coach_complete_own"
  on public.lessons for update
  using (coach_id = auth.uid() and status = 'assigned')
  with check (coach_id = auth.uid() and status = 'completed');

-- lesson_students
create policy "lesson_students_select"
  on public.lesson_students for select
  using (
    public.is_employer()
    or exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and (l.status = 'open' or l.coach_id = auth.uid())
    )
  );

create policy "lesson_students_employer_write"
  on public.lesson_students for all
  using (public.is_employer())
  with check (public.is_employer());

-- lesson_requests
create policy "lesson_requests_select"
  on public.lesson_requests for select
  using (public.is_employer() or coach_id = auth.uid());

create policy "lesson_requests_coach_insert"
  on public.lesson_requests for insert
  with check (
    coach_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_id and l.status = 'open'
    )
  );

create policy "lesson_requests_employer_update"
  on public.lesson_requests for update
  using (public.is_employer())
  with check (public.is_employer());

create policy "lesson_requests_coach_delete_pending"
  on public.lesson_requests for delete
  using (coach_id = auth.uid() and status = 'pending');

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_employer() to authenticated;
grant execute on function public.coach_has_overlap(uuid, timestamptz, timestamptz, uuid) to authenticated;
