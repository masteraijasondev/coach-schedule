-- Seed first employer after creating the auth user in Supabase Dashboard
-- or via Auth Admin API.
--
-- 1) Create user in Authentication > Users (email + password)
-- 2) Run this with that user's UUID:

-- insert into public.profiles (id, email, full_name, role, must_change_password)
-- values (
--   '00000000-0000-0000-0000-000000000000',
--   'employer@example.com',
--   '僱主',
--   'employer',
--   true
-- );

insert into public.lesson_types (name, default_duration_minutes)
values
  ('私人課', 60),
  ('小組課', 60),
  ('體驗課', 30)
on conflict (name) do nothing;
