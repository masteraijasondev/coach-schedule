-- PTA hourly pay mode

do $$
begin
  alter type public.pay_mode add value if not exists 'per_hour';
exception
  when duplicate_object then null;
end $$;
