-- Speed up employer 派更:
-- 1. Replace per-minute generate_series coverage with an interval-length check.
-- 2. Add date-range indexes used by the all-staff calendar.
-- 3. Return student names for a month in one join instead of nested PostgREST embeds.

create or replace function public.coach_availability_covers(
  p_coach_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date;
  v_start_min integer;
  v_end_min integer;
begin
  if p_ends_at <= p_starts_at then
    return false;
  end if;

  v_date := (timezone('Asia/Hong_Kong', p_starts_at))::date;
  if v_date <> (timezone('Asia/Hong_Kong', p_ends_at))::date then
    return false;
  end if;

  v_start_min :=
    extract(hour from timezone('Asia/Hong_Kong', p_starts_at))::integer * 60
    + extract(minute from timezone('Asia/Hong_Kong', p_starts_at))::integer;
  v_end_min :=
    extract(hour from timezone('Asia/Hong_Kong', p_ends_at))::integer * 60
    + extract(minute from timezone('Asia/Hong_Kong', p_ends_at))::integer;

  if v_end_min <= v_start_min then
    return false;
  end if;

  if exists (
    select 1
    from public.staff_leaves
    where coach_id = p_coach_id
      and leave_date = v_date
      and start_minute is null
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.staff_leaves
    where coach_id = p_coach_id
      and leave_date = v_date
      and start_minute is not null
      and start_minute < v_end_min
      and end_minute > v_start_min
  ) then
    return false;
  end if;

  -- Availability rows are non-overlapping (merged on save, carved on Short Break).
  -- Covered length == requested length iff the range has no gaps.
  return coalesce((
    select sum(
      least(a.end_minute, v_end_min) - greatest(a.start_minute, v_start_min)
    )
    from public.staff_availabilities a
    where a.coach_id = p_coach_id
      and a.available_date = v_date
      and a.start_minute < v_end_min
      and a.end_minute > v_start_min
  ), 0) = (v_end_min - v_start_min);
end;
$$;

create index if not exists staff_availabilities_date_idx
  on public.staff_availabilities (available_date);

create index if not exists staff_leaves_date_idx
  on public.staff_leaves (leave_date);

create index if not exists lessons_active_starts_at_idx
  on public.lessons (starts_at)
  where status <> 'cancelled';

create or replace function public.employer_calendar_student_names(
  p_start timestamptz,
  p_end timestamptz
)
returns table(lesson_id uuid, student_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select ls.lesson_id, s.name
  from public.lesson_students ls
  inner join public.students s on s.id = ls.student_id
  inner join public.lessons l on l.id = ls.lesson_id
  where public.is_employer()
    and l.starts_at >= p_start
    and l.starts_at < p_end
    and l.status <> 'cancelled'
  order by ls.lesson_id, s.name;
$$;

revoke all on function public.employer_calendar_student_names(timestamptz, timestamptz)
  from public;
grant execute on function public.employer_calendar_student_names(timestamptz, timestamptz)
  to authenticated;
