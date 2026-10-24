-- PTA check-in does not collect a student, same as Admin.

update public.lesson_types
set registers_student = false
where name ilike 'pta';
