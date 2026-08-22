-- Student list price (coach × student) and lesson snapshots for PT / group attendance

alter table public.coach_student_rates
  add column if not exists student_fee_hkd numeric(10, 2)
    check (student_fee_hkd is null or student_fee_hkd >= 0);

alter table public.lessons
  add column if not exists student_fee_hkd numeric(10, 2)
    check (student_fee_hkd is null or student_fee_hkd >= 0),
  add column if not exists expected_headcount integer
    check (expected_headcount is null or expected_headcount > 0);

-- headcount on lessons = actual attendance (MIIT / optional PT group)
