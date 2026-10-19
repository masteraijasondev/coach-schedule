-- Monthly company expense claims. Receipt files stay in private storage until submit.

create table public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  period text not null,
  amount_hkd numeric(10, 2),
  note text,
  status text not null default 'draft',
  drive_folder_id text,
  drive_folder_url text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_claims_period_format check (period ~ '^\d{4}-\d{2}$'),
  constraint expense_claims_amount_nonnegative check (amount_hkd is null or amount_hkd > 0),
  constraint expense_claims_status_valid check (status in ('draft', 'submitted')),
  constraint expense_claims_coach_period_unique unique (coach_id, period)
);

create index expense_claims_period_idx on public.expense_claims (period, status);

create table public.expense_claim_files (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.expense_claims (id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  storage_path text,
  drive_file_id text,
  created_at timestamptz not null default now()
);

create index expense_claim_files_claim_idx on public.expense_claim_files (claim_id);

alter table public.expense_claims enable row level security;
alter table public.expense_claim_files enable row level security;

create policy "expense_claims_select_own_or_submitted"
  on public.expense_claims for select
  using (
    coach_id = auth.uid()
    or (public.is_employer() and status = 'submitted')
  );

create policy "expense_claim_files_select_own_or_submitted"
  on public.expense_claim_files for select
  using (
    exists (
      select 1
      from public.expense_claims claim
      where claim.id = claim_id
        and (
          claim.coach_id = auth.uid()
          or (public.is_employer() and claim.status = 'submitted')
        )
    )
  );

grant select on public.expense_claims to authenticated;
grant select on public.expense_claim_files to authenticated;
revoke insert, update, delete on public.expense_claims from authenticated;
revoke insert, update, delete on public.expense_claim_files from authenticated;

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;
