-- Admin is paid by hourly rate. Coach is paid by one ratio times the student's Airtable fee.

alter table public.profiles
  add column if not exists hourly_rate_hkd numeric(10, 2),
  add column if not exists pay_ratio numeric(8, 6);

alter table public.profiles
  drop constraint if exists profiles_hourly_rate_nonnegative;

alter table public.profiles
  add constraint profiles_hourly_rate_nonnegative
  check (hourly_rate_hkd is null or hourly_rate_hkd >= 0);

alter table public.profiles
  drop constraint if exists profiles_pay_ratio_range;

alter table public.profiles
  add constraint profiles_pay_ratio_range
  check (pay_ratio is null or (pay_ratio >= 0 and pay_ratio <= 1));
