-- Sign-in accounts for the KindlyPay workspace. Passwords are stored only as scrypt hashes.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin','finance_manager','collection_manager','viewer')),
  created_at timestamptz not null default now()
);
create unique index accounts_email_key on public.accounts (lower(email));
create index accounts_company_idx on public.accounts (company_id);

-- Row-level security on with no policies: browser clients (anon / authenticated keys) can never read
-- credentials. Only the server's own database connection reaches this table.
alter table public.accounts enable row level security;
