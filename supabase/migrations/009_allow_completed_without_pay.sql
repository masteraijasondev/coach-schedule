-- Allow coaches to register completed lessons before pay/fees are set.
-- Employer fills student fee and coach pay afterwards.

alter table public.lessons
  drop constraint if exists lessons_completed_has_coach;

alter table public.lessons
  add constraint lessons_completed_has_coach check (
    status <> 'completed' or coach_id is not null
  );

drop policy if exists "lessons_coach_insert_own" on public.lessons;
create policy "lessons_coach_insert_own"
  on public.lessons for insert
  with check (
    coach_id = auth.uid()
    and status = 'completed'
  );

drop policy if exists "lessons_coach_update_own" on public.lessons;
create policy "lessons_coach_update_own"
  on public.lessons for update
  using (coach_id = auth.uid() and status = 'completed')
  with check (
    coach_id = auth.uid()
    and status = 'completed'
  );
