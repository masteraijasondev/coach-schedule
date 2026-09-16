-- Timed Short Breaks can coexist with availability on the same day.
-- Full-day leave still blocks the whole date.

alter table public.staff_leaves
  add column if not exists start_minute integer,
  add column if not exists end_minute integer;

alter table public.staff_leaves
  drop constraint if exists staff_leaves_coach_id_leave_date_key;

drop index if exists public.staff_leaves_coach_id_leave_date_key;

create unique index if not exists staff_leaves_full_day_unique
  on public.staff_leaves (coach_id, leave_date)
  where start_minute is null;

alter table public.staff_leaves
  drop constraint if exists staff_leaves_time_window;

alter table public.staff_leaves
  add constraint staff_leaves_time_window check (
    (start_minute is null and end_minute is null)
    or (
      start_minute is not null
      and end_minute is not null
      and start_minute >= 0
      and start_minute <= 1410
      and end_minute >= 30
      and end_minute <= 1440
      and start_minute % 30 = 0
      and end_minute % 30 = 0
      and end_minute > start_minute
    )
  );

create or replace function public.carve_staff_availability(
  p_coach_id uuid,
  p_date date,
  p_start integer,
  p_end integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.staff_availabilities%rowtype;
  v_now_hk timestamp := timezone('Asia/Hong_Kong', now());
begin
  for r in
    select *
    from public.staff_availabilities
    where coach_id = p_coach_id
      and available_date = p_date
      and start_minute < p_end
      and end_minute > p_start
    for update
  loop
    if r.available_date::timestamp + make_interval(mins => r.start_minute)
       <= v_now_hk then
      raise exception 'Started availability cannot be changed';
    end if;

    delete from public.staff_availabilities where id = r.id;

    if r.start_minute < p_start then
      insert into public.staff_availabilities (
        coach_id, available_date, start_minute, end_minute
      ) values (p_coach_id, p_date, r.start_minute, p_start);
    end if;

    if r.end_minute > p_end then
      insert into public.staff_availabilities (
        coach_id, available_date, start_minute, end_minute
      ) values (p_coach_id, p_date, p_end, r.end_minute);
    end if;
  end loop;
end;
$$;

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

  delete from public.staff_leaves
  where coach_id = v_user_id
    and leave_date = p_leave_date
    and start_minute is not null;

  insert into public.staff_leaves (coach_id, leave_date, start_minute, end_minute)
  values (v_user_id, p_leave_date, null, null)
  on conflict (coach_id, leave_date) where start_minute is null
  do update set leave_date = excluded.leave_date
  returning id into v_result_id;

  return v_result_id;
end;
$$;

create or replace function public.save_staff_short_break(
  p_id uuid,
  p_leave_date date,
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
  v_existing public.staff_leaves%rowtype;
  v_merge public.staff_leaves%rowtype;
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
    from public.staff_leaves
    where coach_id = v_user_id
      and leave_date = p_leave_date
      and start_minute is null
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

  if p_leave_date::timestamp + make_interval(mins => p_start_minute)
     <= v_now_hk then
    raise exception 'Availability has already started';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_leave_date::text, 0)
  );

  if exists (
    select 1
    from public.lessons
    where coach_id = v_user_id
      and status in ('assigned', 'completed')
      and (timezone('Asia/Hong_Kong', starts_at))::date = p_leave_date
      and (
        extract(hour from timezone('Asia/Hong_Kong', starts_at))::integer * 60
        + extract(minute from timezone('Asia/Hong_Kong', starts_at))::integer
      ) < v_end
      and (
        extract(hour from timezone('Asia/Hong_Kong', ends_at))::integer * 60
        + extract(minute from timezone('Asia/Hong_Kong', ends_at))::integer
      ) > v_start
  ) then
    raise exception 'Cannot take leave on a day with assigned work';
  end if;

  if p_id is not null then
    select *
    into v_existing
    from public.staff_leaves
    where id = p_id
      and coach_id = v_user_id
      and start_minute is not null
    for update;

    if not found then
      raise exception 'Leave was not found';
    end if;

    if v_existing.leave_date::timestamp
       + make_interval(mins => v_existing.start_minute) <= v_now_hk then
      raise exception 'Started availability cannot be changed';
    end if;

    delete from public.staff_leaves where id = p_id;
  end if;

  loop
    select *
    into v_merge
    from public.staff_leaves
    where coach_id = v_user_id
      and leave_date = p_leave_date
      and start_minute is not null
      and start_minute <= v_end
      and end_minute >= v_start
    limit 1
    for update;

    exit when not found;

    v_start := least(v_start, v_merge.start_minute);
    v_end := greatest(v_end, v_merge.end_minute);
    delete from public.staff_leaves where id = v_merge.id;
  end loop;

  perform public.carve_staff_availability(
    v_user_id,
    p_leave_date,
    v_start,
    v_end
  );

  insert into public.staff_leaves (
    coach_id,
    leave_date,
    start_minute,
    end_minute
  )
  values (v_user_id, p_leave_date, v_start, v_end)
  returning id into v_result_id;

  perform public.assert_date_covers_assigned_lessons(v_user_id, p_leave_date);

  return v_result_id;
end;
$$;

create or replace function public.delete_staff_leave(p_leave_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('Asia/Hong_Kong', now())::date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_leave_date < v_today then
    raise exception 'Past leave cannot be deleted';
  end if;

  delete from public.staff_leaves
  where coach_id = v_user_id
    and leave_date = p_leave_date
    and start_minute is null;

  if not found then
    raise exception 'Leave was not found';
  end if;
end;
$$;

create or replace function public.delete_staff_leave_by_id(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now_hk timestamp := timezone('Asia/Hong_Kong', now());
  v_today date := v_now_hk::date;
  v_existing public.staff_leaves%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_existing
  from public.staff_leaves
  where id = p_id and coach_id = v_user_id
  for update;

  if not found then
    raise exception 'Leave was not found';
  end if;

  if v_existing.leave_date < v_today then
    raise exception 'Past leave cannot be deleted';
  end if;

  if v_existing.start_minute is not null
     and v_existing.leave_date::timestamp
       + make_interval(mins => v_existing.start_minute) <= v_now_hk then
    raise exception 'Started availability cannot be changed';
  end if;

  delete from public.staff_leaves where id = p_id;
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

revoke all on function public.carve_staff_availability(uuid, date, integer, integer) from public;
revoke all on function public.save_staff_short_break(uuid, date, integer, integer) from public;
revoke all on function public.delete_staff_leave_by_id(uuid) from public;
grant execute on function public.save_staff_short_break(uuid, date, integer, integer) to authenticated;
grant execute on function public.delete_staff_leave_by_id(uuid) to authenticated;
