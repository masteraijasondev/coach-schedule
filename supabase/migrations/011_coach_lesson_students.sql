-- Coaches register PT lessons and link students on their own calendar.

create policy "lesson_students_coach_write_own"
  on public.lesson_students for all
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and l.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and l.coach_id = auth.uid()
    )
  );
