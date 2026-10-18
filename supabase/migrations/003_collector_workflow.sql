-- Collector daily workflow: case ownership and the follow-up log (lib/data/engine.ts assignCase, logFollowUp).

-- Follow-ups are append-only: a call outcome, a note and when to call again. Every entry is also audited.
create table public.case_follow_ups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  collection_case_id uuid not null references public.collection_cases(id),
  customer_id uuid not null references public.customers(id),
  outcome text not null check (outcome in ('reached','no_answer','promised','disputed')),
  note text not null default '',
  next_follow_up_date date,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index case_follow_ups_company_case_idx on public.case_follow_ups(company_id, collection_case_id, created_at desc);
alter table public.case_follow_ups enable row level security;
create policy tenant_follow_ups on public.case_follow_ups for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());

-- Cases are owned by workspace users (public.users.id). Earlier demo seeds stored free-text names here;
-- clear any value that is not a user of the case's company so the UI never shows a stale owner.
update public.collection_cases c set assigned_to = null
where assigned_to is not null
  and not exists (select 1 from public.users u where u.id::text = c.assigned_to and u.company_id = c.company_id);
create index cases_company_assignee_idx on public.collection_cases(company_id, assigned_to);
