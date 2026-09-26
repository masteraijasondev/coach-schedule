-- Undo a mistaken assignment check-in, leave, or sick report.

alter table public.lessons
  add column if not exists assigned_starts_at timestamptz,
  add column if not exists assigned_ends_at timestamptz,
  add column if not exists assigned_lesson_type_id uuid,
  add column if not exists split_from_lesson_id uuid references public.lessons (id) on delete cascade,
  add column if not exists cancelled_by_leave_id uuid;

alter table public.staff_leaves
  add column if not exists availability_snapshot jsonb;

update public.lessons
set
  assigned_starts_at = starts_at,
  assigned_ends_at = ends_at,
  assigned_lesson_type_id = lesson_type_id
where status = 'assigned'
  and assigned_starts_at is null;

create or replace function public.lessons_capture_assignment()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_starts_at is null then
    new.assigned_starts_at := new.starts_at;
  end if;
  if new.assigned_ends_at is null then
    new.assigned_ends_at := new.ends_at;
  end if;
  if new.assigned_lesson_type_id is null then
    new.assigned_lesson_type_id := new.lesson_type_id;
  end if;
  return new;
end;
$$;

drop trigger if exists lessons_capture_assignment on public.lessons;
create trigger lessons_capture_assignment
before insert on public.lessons
for each row execute function public.lessons_capture_assignment();

create or replace function public.capture_availability_snapshot(
  p_coach_id uuid,
  p_date date,
  p_start integer,
  p_end integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'start_minute', start_minute,
        'end_minute', end_minute,
        'released', released
      )
    ),
    '[]'::jsonb
  )
  from public.staff_availabilities
  where coach_id = p_coach_id
    and available_date = p_date
    and (
      p_start is null
      or (start_minute < p_end and end_minute > p_start)
    );
$$;

create or replace function public.restore_availability_snapshot(
  p_coach_id uuid,
  p_date date,
  p_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_start integer;
  v_end integer;
  v_released boolean;
  v_keep_id uuid;
  v_drop_id uuid;
  v_merged_start integer;
  v_merged_end integer;
  v_merged_released boolean;
begin
  if p_snapshot is null
     or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) = 0 then
    return;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_snapshot)
  loop
    v_start := (v_item->>'start_minute')::integer;
    v_end := (v_item->>'end_minute')::integer;
    v_released := coalesce((v_item->>'released')::boolean, false);
    if v_start is null or v_end is null or v_end <= v_start then
      continue;
    end if;

    delete from public.staff_availabilities
    where coach_id = p_coach_id
      and available_date = p_date
      and start_minute < v_end
      and end_minute > v_start;

    insert into public.staff_availabilities (
      coach_id, available_date, start_minute, end_minute, released
    )
    values (p_coach_id, p_date, v_start, v_end, v_released);
  end loop;

  loop
    select a.id, b.id, least(a.start_minute, b.start_minute), greatest(a.end_minute, b.end_minute), a.released
    into v_keep_id, v_drop_id, v_merged_start, v_merged_end, v_merged_released
    from public.staff_availabilities a
    join public.staff_availabilities b
      on a.coach_id = b.coach_id
     and a.available_date = b.available_date
     and a.released = b.released
     and a.id <> b.id
     and a.start_minute <= b.end_minute
     and b.start_minute <= a.end_minute
    where a.coach_id = p_coach_id
      and a.available_date = p_date
    limit 1;

    exit when not found;

    delete from public.staff_availabilities
    where id in (v_keep_id, v_drop_id);

    insert into public.staff_availabilities (
      coach_id, available_date, start_minute, end_minute, released
    )
    values (p_coach_id, p_date, v_merged_start, v_merged_end, v_merged_released);
  end loop;
end;
$$;

create or replace function public.restore_leave_effects(p_leave public.staff_leaves)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.restore_availability_snapshot(
    p_leave.coach_id,
    p_leave.leave_date,
    p_leave.availability_snapshot
  );

  update public.lessons
  set status = 'assigned',
      cancelled_by_leave_id = null
  where cancelled_by_leave_id = p_leave.id
    and status = 'cancelled';
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
  v_snapshot jsonb;
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

  v_snapshot := public.capture_availability_snapshot(v_user_id, p_leave_date, null, null);

  delete from public.staff_availabilities
  where coach_id = v_user_id
    and available_date = p_leave_date;

  delete from public.staff_leaves
  where coach_id = v_user_id
    and leave_date = p_leave_date
    and start_minute is not null;

  insert into public.staff_leaves (
    coach_id, leave_date, start_minute, end_minute, availability_snapshot
  )
  values (v_user_id, p_leave_date, null, null, v_snapshot)
  on conflict (coach_id, leave_date) where start_minute is null
  do update set
    availability_snapshot = coalesce(
      public.staff_leaves.availability_snapshot,
      excluded.availability_snapshot
    )
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
  v_snapshot jsonb := '[]'::jsonb;
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
      and coalesce(kind, 'leave') = 'leave'
    for update;

    if not found then
      raise exception 'Leave was not found';
    end if;

    if v_existing.leave_date::timestamp
       + make_interval(mins => v_existing.start_minute) <= v_now_hk then
      raise exception 'Started availability cannot be changed';
    end if;

    v_snapshot := v_snapshot || coalesce(v_existing.availability_snapshot, '[]'::jsonb);
    delete from public.staff_leaves where id = p_id;
  end if;

  loop
    select *
    into v_merge
    from public.staff_leaves
    where coach_id = v_user_id
      and leave_date = p_leave_date
      and start_minute is not null
      and coalesce(kind, 'leave') = 'leave'
      and start_minute <= v_end
      and end_minute >= v_start
    limit 1
    for update;

    exit when not found;

    v_start := least(v_start, v_merge.start_minute);
    v_end := greatest(v_end, v_merge.end_minute);
    v_snapshot := v_snapshot || coalesce(v_merge.availability_snapshot, '[]'::jsonb);
    delete from public.staff_leaves where id = v_merge.id;
  end loop;

  v_snapshot := v_snapshot || public.capture_availability_snapshot(
    v_user_id, p_leave_date, v_start, v_end
  );

  perform public.carve_staff_availability(
    v_user_id,
    p_leave_date,
    v_start,
    v_end
  );

  insert into public.staff_leaves (
    coach_id, leave_date, start_minute, end_minute, availability_snapshot
  )
  values (v_user_id, p_leave_date, v_start, v_end, v_snapshot)
  returning id into v_result_id;

  perform public.assert_date_covers_assigned_lessons(v_user_id, p_leave_date);

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
  v_now_hk timestamp := timezone('Asia/Hong_Kong', now());
  v_today date := v_now_hk::date;
  v_full_day boolean := p_start_minute is null and p_end_minute is null;
  v_start integer := p_start_minute;
  v_end integer := p_end_minute;
  v_merge public.staff_leaves%rowtype;
  v_result_id uuid;
  v_snapshot jsonb := '[]'::jsonb;
  v_old_leave_ids uuid[] := '{}';
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
    v_snapshot := public.capture_availability_snapshot(v_user_id, p_leave_date, null, null);

    delete from public.staff_availabilities
    where coach_id = v_user_id
      and available_date = p_leave_date;

    delete from public.staff_leaves
    where coach_id = v_user_id
      and leave_date = p_leave_date
      and start_minute is not null;

    insert into public.staff_leaves (
      coach_id, leave_date, start_minute, end_minute, kind, availability_snapshot
    )
    values (v_user_id, p_leave_date, null, null, 'sick', v_snapshot)
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
      v_snapshot := v_snapshot || coalesce(v_merge.availability_snapshot, '[]'::jsonb);
      v_old_leave_ids := v_old_leave_ids || v_merge.id;
      delete from public.staff_leaves where id = v_merge.id;
    end loop;

    v_snapshot := v_snapshot || public.capture_availability_snapshot(
      v_user_id, p_leave_date, v_start, v_end
    );

    perform public.carve_staff_availability(
      v_user_id,
      p_leave_date,
      v_start,
      v_end
    );

    insert into public.staff_leaves (
      coach_id, leave_date, start_minute, end_minute, kind, availability_snapshot
    )
    values (v_user_id, p_leave_date, v_start, v_end, 'sick', v_snapshot)
    returning id into v_result_id;

    update public.lessons
    set cancelled_by_leave_id = v_result_id
    where cancelled_by_leave_id = any (v_old_leave_ids);
  end if;

  update public.lessons
  set status = 'cancelled',
      cancelled_by_leave_id = v_result_id
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

create or replace function public.delete_staff_leave(p_leave_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('Asia/Hong_Kong', now())::date;
  v_leave public.staff_leaves%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_leave_date < v_today then
    raise exception 'Past leave cannot be deleted';
  end if;

  select *
  into v_leave
  from public.staff_leaves
  where coach_id = v_user_id
    and leave_date = p_leave_date
    and start_minute is null
  for update;

  if not found then
    raise exception 'Leave was not found';
  end if;

  perform public.restore_leave_effects(v_leave);

  delete from public.staff_leaves where id = v_leave.id;
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
  v_today date := timezone('Asia/Hong_Kong', now())::date;
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

  perform public.restore_leave_effects(v_existing);

  delete from public.staff_leaves where id = p_id;
end;
$$;

create or replace function public.undo_staff_check_in(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_lesson public.lessons%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_lesson
  from public.lessons
  where id = p_id
  for update;

  if not found then
    raise exception 'Lesson was not found';
  end if;

  if v_lesson.coach_id is distinct from v_actor and not public.is_employer() then
    raise exception 'Lesson was not found';
  end if;

  if v_lesson.status <> 'completed' then
    raise exception 'Only a completed check-in can be undone';
  end if;

  delete from public.lesson_students
  where lesson_id = p_id
     or lesson_id in (
       select id from public.lessons where split_from_lesson_id = p_id
     );

  delete from public.lessons
  where split_from_lesson_id = p_id;

  update public.lessons
  set
    status = 'assigned',
    earned_amount_hkd = null,
    student_fee_hkd = null,
    starts_at = coalesce(assigned_starts_at, starts_at),
    ends_at = coalesce(assigned_ends_at, ends_at),
    lesson_type_id = coalesce(assigned_lesson_type_id, lesson_type_id)
  where id = p_id;
end;
$$;

create or replace function public.confirm_staff_lesson_periods(
  p_id uuid,
  p_periods jsonb,
  p_lesson_type_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_user_id uuid;
  v_lesson public.lessons%rowtype;
  v_was_assigned boolean;
  v_original_type uuid;
  v_date date;
  v_lesson_start integer;
  v_lesson_end integer;
  v_assign_start integer;
  v_assign_end integer;
  v_avail_start integer;
  v_avail_end integer;
  v_period jsonb;
  v_start integer;
  v_end integer;
  v_cursor integer;
  v_prev_end integer := -1;
  v_index integer := 0;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_amount numeric;
  v_new_id uuid;
  v_student record;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if public.is_employer() then
    select l.coach_id
    into v_user_id
    from public.lessons l
    where l.id = p_id;
    if v_user_id is null then
      raise exception 'Lesson was not found';
    end if;
  else
    v_user_id := v_actor;
  end if;

  if p_periods is null
     or jsonb_typeof(p_periods) <> 'array'
     or jsonb_array_length(p_periods) < 1 then
    raise exception 'At least one check-in period is required';
  end if;

  select *
  into v_lesson
  from public.lessons
  where id = p_id and coach_id = v_user_id
  for update;

  if not found then
    raise exception 'Lesson was not found';
  end if;

  if v_lesson.status not in ('assigned', 'completed') then
    raise exception 'Only pending assignments can be confirmed';
  end if;

  if p_lesson_type_id is null then
    raise exception 'Work type is required';
  end if;

  if not exists (
    select 1
    from public.staff_work_types swt
    join public.lesson_types lt on lt.id = swt.lesson_type_id
    where swt.coach_id = v_user_id
      and swt.lesson_type_id = p_lesson_type_id
      and lt.active
  ) then
    raise exception 'Work type is not assigned to this staff member';
  end if;

  v_was_assigned := v_lesson.status = 'assigned';
  v_original_type := v_lesson.lesson_type_id;
  v_lesson.lesson_type_id := p_lesson_type_id;

  v_date := (timezone('Asia/Hong_Kong', v_lesson.starts_at))::date;
  v_lesson_start :=
    extract(hour from timezone('Asia/Hong_Kong', v_lesson.starts_at))::integer * 60
    + extract(minute from timezone('Asia/Hong_Kong', v_lesson.starts_at))::integer;
  v_lesson_end :=
    extract(hour from timezone('Asia/Hong_Kong', v_lesson.ends_at))::integer * 60
    + extract(minute from timezone('Asia/Hong_Kong', v_lesson.ends_at))::integer;
  v_assign_start := v_lesson_start;
  v_assign_end := v_lesson_end;

  if v_lesson.status = 'completed' then
    select a.start_minute, a.end_minute
    into v_avail_start, v_avail_end
    from public.staff_availabilities a
    where a.coach_id = v_user_id
      and a.available_date = v_date
      and a.released = false
      and a.start_minute <= v_lesson_start
      and a.end_minute >= v_lesson_end
    order by a.start_minute
    limit 1;

    if found then
      v_lesson_start := v_avail_start;
      v_lesson_end := v_avail_end;
    end if;
  end if;

  for v_period in
    select value
    from jsonb_array_elements(p_periods) as t(value)
    order by (t.value->>'start_minute')::integer
  loop
    v_start := (v_period->>'start_minute')::integer;
    v_end := (v_period->>'end_minute')::integer;
    v_amount := nullif(v_period->>'earned_amount_hkd', '')::numeric;

    if v_start is null or v_end is null then
      raise exception 'Check-in period is invalid';
    end if;
    if v_start % 30 <> 0 or v_end % 30 <> 0 or v_end <= v_start then
      raise exception 'Check-in period is invalid';
    end if;
    if v_start < 0 or v_end > 1440 then
      raise exception 'Check-in period is invalid';
    end if;
    if v_start > v_assign_end or v_end < v_assign_start then
      raise exception 'Check-in period is not part of this shift';
    end if;
    if v_start < v_prev_end then
      raise exception 'Check-in periods overlap';
    end if;
    v_prev_end := v_end;

    v_starts_at := (
      v_date::timestamp + make_interval(mins => v_start)
    ) at time zone 'Asia/Hong_Kong';
    v_ends_at := (
      v_date::timestamp + make_interval(mins => v_end)
    ) at time zone 'Asia/Hong_Kong';

    if v_ends_at > now() then
      raise exception 'Check-in period is still in the future';
    end if;

    if v_index = 0 then
      update public.lessons
      set
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        status = 'completed',
        earned_amount_hkd = v_amount,
        lesson_type_id = v_lesson.lesson_type_id
      where id = p_id;
    else
      insert into public.lessons (
        lesson_type_id,
        starts_at,
        ends_at,
        status,
        coach_id,
        earned_amount_hkd,
        student_fee_hkd,
        headcount,
        expected_headcount,
        notes,
        split_from_lesson_id
      )
      values (
        v_lesson.lesson_type_id,
        v_starts_at,
        v_ends_at,
        'completed',
        v_lesson.coach_id,
        v_amount,
        v_lesson.student_fee_hkd,
        v_lesson.headcount,
        v_lesson.expected_headcount,
        v_lesson.notes,
        p_id
      )
      returning id into v_new_id;

      for v_student in
        select student_id
        from public.lesson_students
        where lesson_id = p_id
      loop
        insert into public.lesson_students (lesson_id, student_id)
        values (v_new_id, v_student.student_id);
      end loop;
    end if;

    v_index := v_index + 1;
  end loop;
end;
$$;

revoke all on function public.capture_availability_snapshot(uuid, date, integer, integer) from public;
revoke all on function public.restore_availability_snapshot(uuid, date, jsonb) from public;
revoke all on function public.restore_leave_effects(public.staff_leaves) from public;
revoke all on function public.undo_staff_check_in(uuid) from public;
grant execute on function public.undo_staff_check_in(uuid) to authenticated;
