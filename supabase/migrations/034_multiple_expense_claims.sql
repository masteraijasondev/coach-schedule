-- A submitted claim stays locked. The same coach can still open another claim in that period.

alter table public.expense_claims
  drop constraint expense_claims_coach_period_unique;

create unique index expense_claims_one_draft_per_period
  on public.expense_claims (coach_id, period)
  where status = 'draft';
