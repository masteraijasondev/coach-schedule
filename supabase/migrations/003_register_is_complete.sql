-- Register = complete: coaches insert/update/delete completed lessons

drop policy if exists "lessons_coach_insert_own" on public.lessons;
create policy "lessons_coach_insert_own"
  on public.lessons for insert
  with check (
    coach_id = auth.uid()
    and status = 'completed'
    and earned_amount_hkd is not null
  );

drop policy if exists "lessons_coach_update_assigned" on public.lessons;
drop policy if exists "lessons_coach_complete_own" on public.lessons;

create policy "lessons_coach_update_own"
  on public.lessons for update
  using (coach_id = auth.uid() and status = 'completed')
  with check (
    coach_id = auth.uid()
    and status = 'completed'
    and earned_amount_hkd is not null
  );

drop policy if exists "lessons_coach_delete_assigned" on public.lessons;
create policy "lessons_coach_delete_own"
  on public.lessons for delete
  using (
    coach_id = auth.uid()
    and status in ('assigned', 'completed')
  );

-- Convert existing assigned lessons that already have a matching rate
update public.lessons l
set
  status = 'completed',
  earned_amount_hkd = r.amount_hkd
from public.coach_rates r
where l.status = 'assigned'
  and l.coach_id = r.coach_id
  and l.lesson_type_id = r.lesson_type_id
  and l.earned_amount_hkd is null;
