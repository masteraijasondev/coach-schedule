-- Staff can report availability for a date and time that has already passed.
-- Assigned lessons still have to stay inside a reported window.

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

  if exists (
    select 1
    from public.staff_leaves
    where coach_id = v_user_id
      and leave_date = p_available_date
      and start_minute is null
  ) then
    raise exception 'Cannot submit availability on a leave day';
  end if;

  if exists (
    select 1
    from public.staff_leaves
    where coach_id = v_user_id
      and leave_date = p_available_date
      and start_minute is not null
      and start_minute < p_end_minute
      and end_minute > p_start_minute
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

    if v_existing.released then
      raise exception 'Released availability cannot be changed';
    end if;

    delete from public.staff_availabilities where id = p_id;
  end if;

  delete from public.staff_availabilities
  where coach_id = v_user_id
    and available_date = p_available_date
    and released
    and start_minute < v_end
    and end_minute > v_start;

  loop
    select *
    into v_merge
    from public.staff_availabilities
    where coach_id = v_user_id
      and available_date = p_available_date
      and not released
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
    end_minute,
    released
  )
  values (v_user_id, p_available_date, v_start, v_end, false)
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

  if v_existing.released then
    raise exception 'Released availability cannot be changed';
  end if;

  delete from public.staff_availabilities where id = p_id;

  perform public.assert_date_covers_assigned_lessons(
    v_user_id,
    v_existing.available_date
  );
end;
$$;
