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
  v_now_hk timestamp := timezone('Asia/Hong_Kong', now());
  v_today date := v_now_hk::date;
  v_full_day boolean := p_start_minute is null and p_end_minute is null;
  v_start integer := p_start_minute;
  v_end integer := p_end_minute;
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

  if v_full_day = false and (
    p_start_minute is null
    or p_end_minute is null
    or p_start_minute < 0
    or p_start_minute > 1410
    or p_end_minute < 30
    or p_end_minute > 1440
    or p_start_minute % 30 <> 0
    or p_end_minute % 30 <> 0
    or p_end_minute <= p_start_minute
  ) then
    raise exception 'Availability time is invalid';
  end if;

  if exists (
    select 1
    from public.lessons
    where coach_id = v_user_id
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
    hashtextextended(v_user_id::text || ':' || p_leave_date::text, 0)
  );

  if v_full_day then
    delete from public.staff_availabilities
    where coach_id = v_user_id
      and available_date = p_leave_date;

    delete from public.staff_leaves
    where coach_id = v_user_id
      and leave_date = p_leave_date
      and start_minute is not null;

    insert into public.staff_leaves (
      coach_id, leave_date, start_minute, end_minute, kind
    )
    values (v_user_id, p_leave_date, null, null, 'sick')
    on conflict (coach_id, leave_date) where start_minute is null
    do update set kind = 'sick'
    returning id into v_result_id;
  else
    if exists (
      select 1
      from public.staff_leaves
      where coach_id = v_user_id
        and leave_date = p_leave_date
        and start_minute is null
    ) then
      raise exception 'Cannot submit availability on a leave day';
    end if;

    if exists (
      select 1
      from public.staff_leaves
      where coach_id = v_user_id
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
      where coach_id = v_user_id
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
      delete from public.staff_leaves where id = v_merge.id;
    end loop;

    perform public.carve_staff_availability(
      v_user_id,
      p_leave_date,
      v_start,
      v_end
    );

    insert into public.staff_leaves (
      coach_id, leave_date, start_minute, end_minute, kind
    )
    values (v_user_id, p_leave_date, v_start, v_end, 'sick')
    returning id into v_result_id;
  end if;

  update public.lessons
  set status = 'cancelled'
  where coach_id = v_user_id
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

revoke all on function public.save_staff_sick_leave(date, integer, integer) from public;
grant execute on function public.save_staff_sick_leave(date, integer, integer) to authenticated;
