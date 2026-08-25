-- Staff shift clock-in / clock-out (報更)

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shifts_out_after_in check (
    clocked_out_at is null or clocked_out_at > clocked_in_at
  )
);

create index if not exists shifts_coach_id_idx on public.shifts (coach_id);
create index if not exists shifts_clocked_in_at_idx on public.shifts (clocked_in_at);

-- At most one open shift per coach
create unique index if not exists shifts_one_open_per_coach
  on public.shifts (coach_id)
  where clocked_out_at is null;

alter table public.shifts enable row level security;

create policy "shifts_select_own_or_employer"
  on public.shifts for select
  using (coach_id = auth.uid() or public.is_employer());

create policy "shifts_coach_insert_own"
  on public.shifts for insert
  with check (coach_id = auth.uid());

create policy "shifts_coach_update_own"
  on public.shifts for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

grant select, insert, update, delete on public.shifts to authenticated;
