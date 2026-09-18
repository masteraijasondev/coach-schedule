alter table public.coach_student_rates
  add column if not exists pay_ratio numeric(8, 4)
  check (pay_ratio is null or pay_ratio >= 0);

update public.coach_student_rates
set pay_ratio = round(amount_hkd / student_fee_hkd, 4)
where pay_ratio is null
  and student_fee_hkd is not null
  and student_fee_hkd > 0;
