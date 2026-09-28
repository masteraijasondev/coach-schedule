alter table public.lesson_types
  add column if not exists registers_student boolean not null default false;

-- Keep the current check-in rule for types that already exist.
update public.lesson_types
set registers_student = true
where
  name ilike '%group%'
  or name like '%小組%'
  or name ilike '%miit%'
  or name ilike '%hyrox%'
  or name ilike '%personal%'
  or name ilike '%pt%';
