-- Date-specific staff availability. Existing clock-in/out shifts remain archived.

create table public.staff_availabilities (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  available_date date not null,
  start_minute integer not null,
  end_minute integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_availability_start_valid check (
    start_minute >= 0
    and start_minute <= 1410
    and start_minute % 30 = 0
  ),
  constraint staff_availability_end_valid check (
    end_minute >= 30
    and end_minute <= 1440
    and end_minute % 30 = 0
  ),
  constraint staff_availability_time_valid check (end_minute > start_minute)
);

create index staff_availabilities_coach_date_idx
  on public.staff_availabilities (coach_id, available_date);

alter table public.staff_availabilities enable row level security;

create policy "staff_availabilities_select_own_or_employer"
  on public.staff_availabilities for select
  using (coach_id = auth.uid() or public.is_employer());

grant select on public.staff_availabilities to authenticated;
revoke insert, update, delete on public.staff_availabilities from authenticated;

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
  v_week_start date;
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

  v_week_start := v_today - (extract(isodow from v_today)::integer - 1);

  if p_available_date < v_today
     or p_available_date > v_week_start + 27 then
    raise exception 'Availability date is outside the allowed four-week window';
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
end;
$$;

revoke all on function public.save_staff_availability(uuid, date, integer, integer)
  from public;
revoke all on function public.delete_staff_availability(uuid) from public;
grant execute on function public.save_staff_availability(uuid, date, integer, integer)
  to authenticated;
grant execute on function public.delete_staff_availability(uuid)
  to authenticated;
