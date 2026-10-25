-- Undoing one checked-in slot must not delete the other slots from that shift,
-- and must not stretch this slot back to the original whole-day assignment.

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
  where lesson_id = p_id;

  update public.lessons
  set
    status = 'assigned',
    earned_amount_hkd = null,
    student_fee_hkd = null,
    assigned_starts_at = starts_at,
    assigned_ends_at = ends_at,
    lesson_type_id = coalesce(assigned_lesson_type_id, lesson_type_id)
  where id = p_id;
end;
$$;

revoke all on function public.undo_staff_check_in(uuid) from public;
grant execute on function public.undo_staff_check_in(uuid) to authenticated;
