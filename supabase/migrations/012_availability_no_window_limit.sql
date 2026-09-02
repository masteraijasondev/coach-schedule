-- Allow coaches to submit availability and leave for any future date.

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

  return v_result_id;
end;
$$;
