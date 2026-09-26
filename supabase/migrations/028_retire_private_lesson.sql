-- 私人課 is no longer a work type. Existing lessons keep the row for history.
update public.lesson_types
set active = false
where name = '私人課';

delete from public.staff_work_types
where lesson_type_id in (
  select id from public.lesson_types where name = '私人課'
);
