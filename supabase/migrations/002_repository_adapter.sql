-- Aligns the schema with the PostgreSQL repository adapter (lib/data/postgres-repository.ts).

-- Policy steps are addressed by a stable key (e.g. 'friendly-3') that collection action snapshots
-- reference to keep the daily monitor idempotent. The uuid id stays as the row identity.
alter table public.collection_policy_steps add column step_key text;
update public.collection_policy_steps set step_key = id::text where step_key is null;
alter table public.collection_policy_steps alter column step_key set not null;
alter table public.collection_policy_steps add constraint collection_policy_steps_policy_step_key_key unique (policy_id, step_key);

-- Replies from an unknown sender are stored for manual triage before any customer is known.
alter table public.communication_messages alter column customer_id drop not null;

-- Assignment and approval record the acting identity as text, like audit_events.actor_id,
-- until workspace users are provisioned through Supabase Auth.
alter table public.collection_cases drop constraint if exists collection_cases_assigned_to_fkey;
alter table public.collection_cases alter column assigned_to type text using assigned_to::text;
alter table public.collection_actions drop constraint if exists collection_actions_approved_by_fkey;
alter table public.collection_actions alter column approved_by type text using approved_by::text;

-- Company-wide activity feeds read the newest audit events first.
create index audit_company_created_idx on public.audit_events(company_id, created_at desc);
create index payments_company_invoice_idx on public.payments(company_id, invoice_id);
create index promises_company_invoice_idx on public.payment_promises(company_id, invoice_id);
