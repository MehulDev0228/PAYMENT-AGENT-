create extension if not exists pgcrypto;

create type public.user_role as enum ('admin','finance_manager','collection_manager','viewer');
create type public.invoice_status as enum ('pending','partially_paid','paid','overdue','cancelled');
create type public.case_status as enum ('monitoring','due','overdue','reminder_pending','reminder_sent','customer_replied','payment_promised','payment_received','promise_missed','escalated','closed');
create type public.promise_status as enum ('active','fulfilled','missed','cancelled');
create type public.action_status as enum ('pending','awaiting_approval','approved','executed','rejected','failed');
create type public.autonomy_mode as enum ('draft_only','routine_automatic','human_approval');

create table public.companies (
  id uuid primary key default gen_random_uuid(), name text not null, currency char(3) not null default 'INR', timezone text not null default 'Asia/Kolkata',
  autonomy_mode public.autonomy_mode not null default 'routine_automatic', created_at timestamptz not null default now()
);
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade, company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, email text not null, role public.user_role not null default 'viewer', created_at timestamptz not null default now(), unique(company_id,email)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, customer_code text not null,
  name text not null, email text not null, phone text, region text, account_manager text, status text not null default 'active' check (status in ('active','on_hold','inactive')),
  created_at timestamptz not null default now(), unique(company_id,customer_code)
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, customer_id uuid not null references public.customers(id),
  invoice_number text not null, invoice_date date not null, due_date date not null, amount numeric(18,2) not null check(amount >= 0), currency char(3) not null,
  amount_paid numeric(18,2) not null default 0 check(amount_paid >= 0), amount_outstanding numeric(18,2) not null check(amount_outstanding >= 0),
  status public.invoice_status not null default 'pending', source text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,invoice_number), check(amount_paid + amount_outstanding = amount)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, invoice_id uuid references public.invoices(id),
  customer_id uuid references public.customers(id), payment_reference text not null, amount numeric(18,2) not null check(amount > 0), payment_date date not null,
  source text not null, match_status text not null check(match_status in ('matched','unmatched','payment_match_review_required')), match_notes text,
  created_at timestamptz not null default now(), unique(company_id,payment_reference)
);
create table public.collection_cases (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, invoice_id uuid not null references public.invoices(id),
  customer_id uuid not null references public.customers(id), status public.case_status not null default 'monitoring', priority text not null check(priority in ('low','medium','high','critical')),
  days_overdue integer not null default 0 check(days_overdue >= 0), next_action text not null, next_action_at timestamptz, assigned_to uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,invoice_id)
);
create table public.collection_actions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, collection_case_id uuid not null references public.collection_cases(id),
  invoice_id uuid not null references public.invoices(id), customer_id uuid not null references public.customers(id), action_type text not null check(action_type in ('reminder','follow_up','payment_confirmation','escalation','internal_notification')),
  channel text not null check(channel in ('email','internal')), message text not null, reason text not null, data_snapshot jsonb not null default '{}',
  scheduled_at timestamptz, executed_at timestamptz, status public.action_status not null default 'pending', created_by text not null check(created_by in ('aera','human','system')),
  approved_by uuid references public.users(id), created_at timestamptz not null default now()
);
create table public.payment_promises (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, invoice_id uuid not null references public.invoices(id),
  customer_id uuid not null references public.customers(id), promised_amount numeric(18,2) check(promised_amount > 0), promised_date date not null,
  source_message_id text not null, status public.promise_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.communication_messages (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, customer_id uuid not null references public.customers(id),
  invoice_id uuid references public.invoices(id), collection_case_id uuid references public.collection_cases(id), channel text not null check(channel = 'email'),
  direction text not null check(direction in ('inbound','outbound')), external_message_id text, subject text not null, body text not null, received_at timestamptz, processed_at timestamptz,
  unique(company_id,external_message_id)
);
create table public.collection_policies (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, name text not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.collection_policy_steps (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, policy_id uuid not null references public.collection_policies(id) on delete cascade,
  days_overdue integer not null check(days_overdue >= 0), action text not null check(action in ('reminder','escalation')), tone text not null check(tone in ('friendly','firm','urgent')),
  requires_human_approval boolean not null default false, escalation_level text, unique(policy_id,days_overdue)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, actor_type text not null check(actor_type in ('aera','human','system')),
  actor_id text, event_type text not null, entity_type text not null, entity_id text not null, reason text not null, data_snapshot jsonb not null default '{}', created_at timestamptz not null default now()
);

create index invoices_company_due_idx on public.invoices(company_id,due_date) where amount_outstanding > 0;
create index cases_company_status_idx on public.collection_cases(company_id,status,next_action_at);
create index promises_company_due_idx on public.payment_promises(company_id,status,promised_date);
create index actions_company_status_idx on public.collection_actions(company_id,status,scheduled_at);
create index messages_company_external_idx on public.communication_messages(company_id,external_message_id);
create index audit_company_entity_idx on public.audit_events(company_id,entity_type,entity_id,created_at desc);

create or replace function public.current_company_id() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'company_id','')::uuid
$$;

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.collection_cases enable row level security;
alter table public.collection_actions enable row level security;
alter table public.payment_promises enable row level security;
alter table public.communication_messages enable row level security;
alter table public.collection_policies enable row level security;
alter table public.collection_policy_steps enable row level security;
alter table public.audit_events enable row level security;

create policy company_self on public.companies for select using(id = public.current_company_id());
create policy tenant_users on public.users for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_customers on public.customers for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_invoices on public.invoices for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_payments on public.payments for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_cases on public.collection_cases for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_actions on public.collection_actions for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_promises on public.payment_promises for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_messages on public.communication_messages for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_policies on public.collection_policies for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_policy_steps on public.collection_policy_steps for all using(company_id = public.current_company_id()) with check(company_id = public.current_company_id());
create policy tenant_audit on public.audit_events for select using(company_id = public.current_company_id());

-- Audit events are append-only for authenticated tenant members. Updates/deletes have no policy.
create policy tenant_audit_insert on public.audit_events for insert with check(company_id = public.current_company_id());
