-- Daily ledger sync (lib/data/engine.ts importInvoices): re-imports update known invoices, and anything
-- a person must reconcile is recorded on the invoice instead of overwriting AERA's payment record.

-- While reconciliation_status = 'balance_mismatch': the balance the ERP reported, kept beside AERA's own.
alter table public.invoices add column erp_outstanding numeric(18,2) check (erp_outstanding >= 0);

-- Set while the invoice needs reconciliation: the ERP balance differs, the full ledger no longer lists it,
-- or the ERP amount fell below what AERA has recorded as paid.
alter table public.invoices add column reconciliation_status text
  check (reconciliation_status in ('balance_mismatch', 'missing_from_ledger', 'amount_below_paid'));
alter table public.invoices add column reconciliation_note text;

create index invoices_company_reconciliation_idx on public.invoices(company_id) where reconciliation_status is not null;
