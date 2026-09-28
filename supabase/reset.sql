-- Full data reset (keeps schema). Run in Supabase SQL Editor.

delete from public.lesson_students;
delete from public.lesson_requests;
delete from public.lessons;
delete from public.coach_student_rates;
delete from public.coach_rates;
delete from public.students;
delete from public.profiles where role = 'coach';
delete from public.lesson_types;

insert into public.lesson_types (name, default_duration_minutes, pay_mode, registers_student)
values
  ('PT', 60, 'per_student', true),
  ('MIIT', 60, 'per_head', true),
  ('PTA', 60, 'per_hour', true),
  ('Admin', 60, 'per_hour', false)
on conflict (name) do nothing;
