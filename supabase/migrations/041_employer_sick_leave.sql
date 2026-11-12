-- Employer can convert an assignment to sick leave with the same effects as
-- coach self-serve: carve availability, cancel overlapping assigned shifts,
-- and snapshot so undo can restore. Also allow carving started availability
-- for sick leave (staff may report after the window has begun).

create or replace function public.carve_staff_availability_for_leave(
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
    delete from public.staff_availabilities where id = r.id;

    if r.start_minute < p_start then
      insert into public.staff_availabilities (
        coach_id, available_date, start_minute, end_minute, released
      ) values (p_coach_id, p_date, r.start_minute, p_start, r.released);
    end if;

    if r.end_minute > p_end then
      insert into public.staff_availabilities (
        coach_id, available_date, start_minute, end_minute, released
      ) values (p_coach_id, p_date, p_end, r.end_minute, r.released);
    end if;
  end loop;
end;
$$;

create or replace function public.save_staff_sick_leave_for_coach(
  p_coach_id uuid,
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
  v_full_day boolean := p_start_minute is null and p_end_minute is null;
  v_start integer := p_start_minute;
  v_end integer := p_end_minute;
  v_merge public.staff_leaves%rowtype;
  v_result_id uuid;
  v_snapshot jsonb := '[]'::jsonb;
  v_old_leave_ids uuid[] := '{}';
begin
  if p_coach_id is null then
    raise exception 'Coach is required';
  end if;

  -- Allow 15-minute alignment so employer「轉為病假」matches assigned shift windows.
  if v_full_day = false and (
    p_start_minute is null
    or p_end_minute is null
    or p_start_minute < 0
    or p_start_minute > 1425
    or p_end_minute < 15
    or p_end_minute > 1440
    or p_start_minute % 15 <> 0
    or p_end_minute % 15 <> 0
    or p_end_minute <= p_start_minute
  ) then
    raise exception 'Availability time is invalid';
  end if;

  if exists (
    select 1
    from public.lessons
    where coach_id = p_coach_id
      and status = 'completed'
      and (timezone('Asia/Hong_Kong', starts_at))::date = p_leave_date
      and (
        v_full_day
        or (
          (
            extract(hour from timezone('Asia/Hong_Kong', starts_at))::integer * 60
            + extract(minute from timezone('Asia/Hong_Kong', starts_at))::integer
          ) < v_end
          and (
            extract(hour from timezone('Asia/Hong_Kong', ends_at))::integer * 60
            + extract(minute from timezone('Asia/Hong_Kong', ends_at))::integer
          ) > v_start
        )
      )
  ) then
    raise exception 'Completed work cannot be changed to sick leave';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_coach_id::text || ':' || p_leave_date::text, 0)
  );

  if v_full_day then
    v_snapshot := public.capture_availability_snapshot(p_coach_id, p_leave_date, null, null);

    delete from public.staff_availabilities
    where coach_id = p_coach_id
      and available_date = p_leave_date;

    delete from public.staff_leaves
    where coach_id = p_coach_id
      and leave_date = p_leave_date
      and start_minute is not null;

    insert into public.staff_leaves (
      coach_id, leave_date, start_minute, end_minute, kind, availability_snapshot
    )
    values (p_coach_id, p_leave_date, null, null, 'sick', v_snapshot)
    on conflict (coach_id, leave_date) where start_minute is null
    do update set
      kind = 'sick',
      availability_snapshot = coalesce(
        public.staff_leaves.availability_snapshot,
        excluded.availability_snapshot
      )
    returning id into v_result_id;
  else
    if exists (
      select 1
      from public.staff_leaves
      where coach_id = p_coach_id
        and leave_date = p_leave_date
        and start_minute is null
    ) then
      raise exception 'Cannot submit availability on a leave day';
    end if;

    if exists (
      select 1
      from public.staff_leaves
      where coach_id = p_coach_id
        and leave_date = p_leave_date
        and start_minute is not null
        and coalesce(kind, 'leave') <> 'sick'
        and start_minute < v_end
        and end_minute > v_start
    ) then
      raise exception 'Cannot submit availability on a leave day';
    end if;

    loop
      select *
      into v_merge
      from public.staff_leaves
      where coach_id = p_coach_id
        and leave_date = p_leave_date
        and kind = 'sick'
        and start_minute is not null
        and start_minute <= v_end
        and end_minute >= v_start
      limit 1
      for update;

      exit when not found;

      v_start := least(v_start, v_merge.start_minute);
      v_end := greatest(v_end, v_merge.end_minute);
      v_snapshot := v_snapshot || coalesce(v_merge.availability_snapshot, '[]'::jsonb);
      v_old_leave_ids := v_old_leave_ids || v_merge.id;
      delete from public.staff_leaves where id = v_merge.id;
    end loop;

    v_snapshot := v_snapshot || public.capture_availability_snapshot(
      p_coach_id, p_leave_date, v_start, v_end
    );

    perform public.carve_staff_availability_for_leave(
      p_coach_id,
      p_leave_date,
      v_start,
      v_end
    );

    insert into public.staff_leaves (
      coach_id, leave_date, start_minute, end_minute, kind, availability_snapshot
    )
    values (p_coach_id, p_leave_date, v_start, v_end, 'sick', v_snapshot)
    returning id into v_result_id;

    update public.lessons
    set cancelled_by_leave_id = v_result_id
    where cancelled_by_leave_id = any (v_old_leave_ids);
  end if;

  update public.lessons
  set status = 'cancelled',
      cancelled_by_leave_id = v_result_id
  where coach_id = p_coach_id
    and status = 'assigned'
    and (timezone('Asia/Hong_Kong', starts_at))::date = p_leave_date
    and (
      v_full_day
      or (
        (
          extract(hour from timezone('Asia/Hong_Kong', starts_at))::integer * 60
          + extract(minute from timezone('Asia/Hong_Kong', starts_at))::integer
        ) < v_end
        and (
          extract(hour from timezone('Asia/Hong_Kong', ends_at))::integer * 60
          + extract(minute from timezone('Asia/Hong_Kong', ends_at))::integer
        ) > v_start
      )
    );

  return v_result_id;
end;
$$;

create or replace function public.save_staff_sick_leave(
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
  v_today date := timezone('Asia/Hong_Kong', now())::date;
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

  return public.save_staff_sick_leave_for_coach(
    v_user_id,
    p_leave_date,
    p_start_minute,
    p_end_minute
  );
end;
$$;

create or replace function public.employer_save_staff_sick_leave(
  p_coach_id uuid,
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
  v_actor uuid := auth.uid();
  v_today date := timezone('Asia/Hong_Kong', now())::date;
begin
  if v_actor is null or not exists (
    select 1
    from public.profiles
    where id = v_actor and role = 'employer'
  ) then
    raise exception 'Only employers can submit leave for staff';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_coach_id and role = 'coach'
  ) then
    raise exception 'Coach was not found';
  end if;

  if p_leave_date < v_today then
    raise exception 'Leave date is in the past';
  end if;

  return public.save_staff_sick_leave_for_coach(
    p_coach_id,
    p_leave_date,
    p_start_minute,
    p_end_minute
  );
end;
$$;

create or replace function public.employer_delete_staff_leave_by_id(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_today date := timezone('Asia/Hong_Kong', now())::date;
  v_existing public.staff_leaves%rowtype;
begin
  if v_actor is null or not exists (
    select 1
    from public.profiles
    where id = v_actor and role = 'employer'
  ) then
    raise exception 'Only employers can delete staff leave';
  end if;

  select *
  into v_existing
  from public.staff_leaves
  where id = p_id
  for update;

  if not found then
    raise exception 'Leave was not found';
  end if;

  if v_existing.leave_date < v_today then
    raise exception 'Past leave cannot be deleted';
  end if;

  perform public.restore_leave_effects(v_existing);

  delete from public.staff_leaves where id = p_id;
end;
$$;

revoke all on function public.carve_staff_availability_for_leave(uuid, date, integer, integer) from public;
revoke all on function public.save_staff_sick_leave_for_coach(uuid, date, integer, integer) from public;
revoke all on function public.employer_save_staff_sick_leave(uuid, date, integer, integer) from public;
revoke all on function public.employer_delete_staff_leave_by_id(uuid) from public;

grant execute on function public.employer_save_staff_sick_leave(uuid, date, integer, integer) to authenticated;
grant execute on function public.employer_delete_staff_leave_by_id(uuid) to authenticated;
