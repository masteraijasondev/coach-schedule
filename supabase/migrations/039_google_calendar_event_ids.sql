-- Store Google Calendar event ids for outbound sync (idempotent).

alter table public.lessons
  add column if not exists google_event_id text;

alter table public.staff_availabilities
  add column if not exists google_event_id text;

alter table public.staff_leaves
  add column if not exists google_event_id text;
