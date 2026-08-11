-- Coach self-logging calendar: insert/update/delete own assigned lessons

drop policy if exists "lessons_select_employer_own_or_open" on public.lessons;
create policy "lessons_select_employer_or_own"
  on public.lessons for select
  using (
    public.is_employer()
    or coach_id = auth.uid()
  );

create policy "lessons_coach_insert_own"
  on public.lessons for insert
  with check (
    coach_id = auth.uid()
    and status = 'assigned'
  );

drop policy if exists "lessons_coach_complete_own" on public.lessons;

create policy "lessons_coach_update_assigned"
  on public.lessons for update
  using (coach_id = auth.uid() and status = 'assigned')
  with check (coach_id = auth.uid() and status = 'assigned');

create policy "lessons_coach_complete_own"
  on public.lessons for update
  using (coach_id = auth.uid() and status = 'assigned')
  with check (coach_id = auth.uid() and status = 'completed');

create policy "lessons_coach_delete_assigned"
  on public.lessons for delete
  using (coach_id = auth.uid() and status = 'assigned');
