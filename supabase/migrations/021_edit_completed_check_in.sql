-- Staff can revise a completed check-in inside the covering availability window.

create or replace function public.confirm_staff_lesson_periods(
  p_id uuid,
  p_periods jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lesson public.lessons%rowtype;
  v_date date;
  v_lesson_start integer;
  v_lesson_end integer;
  v_avail_start integer;
  v_avail_end integer;
  v_period jsonb;
  v_start integer;
  v_end integer;
  v_prev_end integer := -1;
  v_index integer := 0;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_amount numeric;
  v_new_id uuid;
  v_student record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
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

  v_date := (timezone('Asia/Hong_Kong', v_lesson.starts_at))::date;
  v_lesson_start :=
    extract(hour from timezone('Asia/Hong_Kong', v_lesson.starts_at))::integer * 60
    + extract(minute from timezone('Asia/Hong_Kong', v_lesson.starts_at))::integer;
  v_lesson_end :=
    extract(hour from timezone('Asia/Hong_Kong', v_lesson.ends_at))::integer * 60
    + extract(minute from timezone('Asia/Hong_Kong', v_lesson.ends_at))::integer;

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
    if v_start < v_lesson_start or v_end > v_lesson_end then
      raise exception 'Check-in period is outside the assignment';
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
        earned_amount_hkd = v_amount
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
        notes
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
        v_lesson.notes
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

revoke all on function public.confirm_staff_lesson_periods(uuid, jsonb) from public;
grant execute on function public.confirm_staff_lesson_periods(uuid, jsonb)
  to authenticated;
