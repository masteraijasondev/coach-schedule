-- Assign-from-availability flow: employer assigns → employee confirms → pays.

-- True when the coach has continuous availability covering [starts_at, ends_at)
-- in Asia/Hong_Kong, and is not on leave that day.
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

  if exists (
    select 1
    from public.staff_leaves
    where coach_id = p_coach_id
      and leave_date = v_date
  ) then
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

  return not exists (
    select 1
    from generate_series(v_start_min, v_end_min - 1) as tick(minute)
    where not exists (
      select 1
      from public.staff_availabilities a
      where a.coach_id = p_coach_id
        and a.available_date = v_date
        and a.start_minute <= tick.minute
        and a.end_minute > tick.minute
    )
  );
end;
$$;

create or replace function public.assert_date_covers_assigned_lessons(
  p_coach_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson record;
begin
  for v_lesson in
    select id, starts_at, ends_at
    from public.lessons
    where coach_id = p_coach_id
      and status in ('assigned', 'completed')
      and (timezone('Asia/Hong_Kong', starts_at))::date = p_date
  loop
    if not public.coach_availability_covers(
      p_coach_id,
      v_lesson.starts_at,
      v_lesson.ends_at
    ) then
      raise exception 'Availability is locked by an assigned lesson';
    end if;
  end loop;
end;
$$;

create or replace function public.confirm_staff_lesson(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lesson public.lessons%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_lesson
  from public.lessons
  where id = p_id and coach_id = v_user_id
  for update;

  if not found then
    raise exception 'Lesson was not found';
  end if;

  if v_lesson.status <> 'assigned' then
    raise exception 'Only pending assignments can be confirmed';
  end if;

  if v_lesson.starts_at <= now() then
    raise exception 'Lesson has already started';
  end if;

  update public.lessons
  set status = 'completed'
  where id = p_id;
end;
$$;

-- Coaches no longer self-register lessons.
drop policy if exists "lessons_coach_insert_own" on public.lessons;
drop policy if exists "lessons_coach_update_own" on public.lessons;
drop policy if exists "lessons_coach_delete_own" on public.lessons;
drop policy if exists "lessons_coach_update_assigned" on public.lessons;
drop policy if exists "lessons_coach_complete_own" on public.lessons;
drop policy if exists "lessons_coach_delete_assigned" on public.lessons;

revoke all on function public.coach_availability_covers(uuid, timestamptz, timestamptz)
  from public;
revoke all on function public.confirm_staff_lesson(uuid) from public;
grant execute on function public.coach_availability_covers(uuid, timestamptz, timestamptz)
  to authenticated;
grant execute on function public.confirm_staff_lesson(uuid) to authenticated;

-- Lock availability / leave when assigned or confirmed lessons exist.
create or replace function public.set_staff_leave(p_leave_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now_hk timestamp := timezone('Asia/Hong_Kong', now());
  v_today date := v_now_hk::date;
  v_result_id uuid;
begin
  if v_user_id is null or not exists (
    select 1
    from public.profiles
    where id = v_user_id and role = 'coach'
  ) then
    raise exception 'Only coaches can submit leave';
  end if;

  if p_leave_date < v_today then
    raise exception 'Leave date is in the past';
  end if;

  if exists (
    select 1
    from public.lessons
    where coach_id = v_user_id
      and status in ('assigned', 'completed')
      and (timezone('Asia/Hong_Kong', starts_at))::date = p_leave_date
  ) then
    raise exception 'Cannot take leave on a day with assigned work';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_leave_date::text, 0)
  );

  if exists (
    select 1
    from public.staff_availabilities
    where coach_id = v_user_id
      and available_date = p_leave_date
      and available_date::timestamp + make_interval(mins => start_minute)
        <= v_now_hk
  ) then
    raise exception 'Started availability cannot be changed';
  end if;

  delete from public.staff_availabilities
  where coach_id = v_user_id
    and available_date = p_leave_date;

  insert into public.staff_leaves (coach_id, leave_date)
  values (v_user_id, p_leave_date)
  on conflict (coach_id, leave_date) do update
    set leave_date = excluded.leave_date
  returning id into v_result_id;

  return v_result_id;
end;
$$;

create or replace function public.save_staff_availability(
  p_id uuid,
  p_available_date date,
  p_start_minute integer,
  p_end_minute integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now_hk timestamp := timezone('Asia/Hong_Kong', now());
  v_today date := v_now_hk::date;
  v_start integer := p_start_minute;
  v_end integer := p_end_minute;
  v_existing public.staff_availabilities%rowtype;
  v_merge public.staff_availabilities%rowtype;
  v_result_id uuid;
begin
  if v_user_id is null or not exists (
    select 1
    from public.profiles
    where id = v_user_id and role = 'coach'
  ) then
    raise exception 'Only coaches can submit availability';
  end if;

  if p_available_date < v_today then
    raise exception 'Availability date is in the past';
  end if;

  if exists (
    select 1
    from public.staff_leaves
    where coach_id = v_user_id
      and leave_date = p_available_date
  ) then
    raise exception 'Cannot submit availability on a leave day';
  end if;

  if p_start_minute < 0
     or p_start_minute > 1410
     or p_end_minute < 30
     or p_end_minute > 1440
     or p_start_minute % 30 <> 0
     or p_end_minute % 30 <> 0
     or p_end_minute <= p_start_minute then
    raise exception 'Availability time is invalid';
  end if;

  if p_available_date::timestamp + make_interval(mins => p_start_minute)
     <= v_now_hk then
    raise exception 'Availability has already started';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_available_date::text, 0)
  );

  if p_id is not null then
    select *
    into v_existing
    from public.staff_availabilities
    where id = p_id and coach_id = v_user_id
    for update;

    if not found then
      raise exception 'Availability was not found';
    end if;

    if v_existing.available_date::timestamp
       + make_interval(mins => v_existing.start_minute) <= v_now_hk then
      raise exception 'Started availability cannot be changed';
    end if;

    delete from public.staff_availabilities where id = p_id;
  end if;

  if exists (
    select 1
    from public.staff_availabilities
    where coach_id = v_user_id
      and available_date = p_available_date
      and available_date::timestamp + make_interval(mins => start_minute)
        <= v_now_hk
      and start_minute < v_end
      and end_minute > v_start
  ) then
    raise exception 'Started availability cannot be changed';
  end if;

  loop
    select *
    into v_merge
    from public.staff_availabilities
    where coach_id = v_user_id
      and available_date = p_available_date
      and available_date::timestamp + make_interval(mins => start_minute)
        > v_now_hk
      and start_minute <= v_end
      and end_minute >= v_start
    limit 1
    for update;

    exit when not found;

    v_start := least(v_start, v_merge.start_minute);
    v_end := greatest(v_end, v_merge.end_minute);
    delete from public.staff_availabilities where id = v_merge.id;
  end loop;

  insert into public.staff_availabilities (
    coach_id,
    available_date,
    start_minute,
    end_minute
  )
  values (v_user_id, p_available_date, v_start, v_end)
  returning id into v_result_id;

  perform public.assert_date_covers_assigned_lessons(v_user_id, p_available_date);

  return v_result_id;
end;
$$;

create or replace function public.delete_staff_availability(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now_hk timestamp := timezone('Asia/Hong_Kong', now());
  v_existing public.staff_availabilities%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_existing
  from public.staff_availabilities
  where id = p_id and coach_id = v_user_id
  for update;

  if not found then
    raise exception 'Availability was not found';
  end if;

  if v_existing.available_date::timestamp
     + make_interval(mins => v_existing.start_minute) <= v_now_hk then
    raise exception 'Started availability cannot be deleted';
  end if;

  delete from public.staff_availabilities where id = p_id;

  perform public.assert_date_covers_assigned_lessons(
    v_user_id,
    v_existing.available_date
  );
end;
$$;
