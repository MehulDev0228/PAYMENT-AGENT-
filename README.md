# AERA: Payment Collection Agent (V1)

Auditable accounts-receivable operations. AERA monitors every invoice, sends routine reminders, records customer promises, verifies them against bank files and reconciles payments, while every financial decision stays with a person.

The local build runs on a deterministic, fictional dataset (200 customers, 1,000 invoices, 560+ payments, an ambiguous bank entry, collection cases, promises and approvals) and needs no external services.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` for the product site and `http://localhost:3000/dashboard` for the workspace. Copy `.env.example` to `.env.local` only when you want to change defaults (see below).

With no configuration the app runs in **dev mode: authentication is off** and every request acts as the demo finance manager (the topbar shows "Dev mode · no sign-in"). This is for a developer machine only. Real data needs Supabase Auth, see [Sign-in with Supabase Auth](#sign-in-with-supabase-auth).

```bash
npm run check   # typecheck + unit/integration tests (both adapters, embedded Postgres)
npm run build   # production build
```

## What is in V1

**Product site** (`/`): marketing page with live numbers from the demo ledger.

**Workspace**

| Route | Purpose |
| --- | --- |
| `/dashboard` | Today's agenda (decisions, promises due, payments to match, missed promises), follow-up calls due today, KPIs, a by-region table, priority cases, ageing, audit activity |
| `/regions` | The region sheet: outstanding, overdue, every ageing bucket, promises due, missed promises and collected this month per region, with a total row and CSV download |
| `/cases`, `/cases/[id]` | Queue with views, search, priority, region and owner filters, "My cases" and pagination; case paper trail merging emails, calls, payments and audit events; owner picker and follow-up log |
| `/approvals` | Human decision queue (escalations, disputes, payment-plan requests) with decision history |
| `/promises` | Active / missed / kept / superseded promises |
| `/payments` | Ambiguous-payment review with ranked candidates, and the full payment ledger |
| `/customers`, `/customers/[id]` | Exposure by customer, invoices, payments and promise record |
| `/ageing` | Receivables ageing by customer in 30-day bands (not due, 1–30, 31–60, 61–90, 90+) with totals |
| `/imports` | Daily invoice ledger sync (preview, then apply) and payment import, validated row by row |
| `/automation` | Run the daily monitor, simulated reminder dispatch, promise check and reply processing by hand |
| `/ask` | Read-only questions answered by named repository tools, with tabular evidence |
| `/policy` | Policy ladder and hard limits |
| `/login` | Email and password sign-in (Supabase Auth) |

Press `Ctrl K` / `⌘ K` anywhere in the workspace to search invoices, customers and pages.

## Regions

Region is the customer's `region` (the `region` column of the invoice import). It is meant to replace the per-region outstanding sheets a finance team keeps in Excel.

- **Filter.** `/dashboard`, `/cases`, `/customers`, `/payments` and `/promises` take `?region=North` (region pills under the page title). So do their APIs: `GET /api/collections/overview`, `/api/collections/cases`, `/api/customers`, `/api/payments` and `/api/collections/promises`. Regions compare case- and whitespace-insensitively.
- **Region sheet.** `/regions` and `GET /api/regions` (`?format=csv` for a spreadsheet) give one row per region, plus "No region" for customers without one. Ask AERA answers "outstanding by region" from the same data.
- **Region-scoped users.** `public.users.regions` (migration `003_user_regions.sql`) limits a user to customers in those regions; `NULL` means every region. Give it with `npm run db:add-user -- nita@yourco.com --company <id> --role collection_manager --regions North,West`. Without `--regions` a new user gets every region and an existing user keeps theirs; `--regions all` lifts a limit.
  - The limit is enforced in the repository (`lib/data/repository.ts`), not the UI: the caller's context is the data scope of every call, and the engine runs on a view holding only that scope's customers and their invoices, payments, cases, actions, promises and messages. Another region's case, invoice or payment reads as not found and cannot be approved, executed or matched.
  - A regional user may import invoices for their regions only (other rows are rejected with the reason). Bank files span every region, so payment imports, and matching payments not yet tied to a customer, need a user with every region.
  - The activity feed of a regional user shows events of rows in their regions, not company-wide import or job summaries. Restrictive RLS policies in migration 003 apply the same limits to direct Supabase client access.
- In dev mode, `AERA_DEV_REGIONS=North` makes the demo user regional.

### The collector's day

AERA replaces the daily outstanding sheet, so the habits around that sheet live in the workspace:

- **Export to Excel.** Cases, customers and payments have **Export Excel** (`.xlsx`) and **CSV** buttons that download exactly the current filtered view (tab, search, priority, owner, match status). `/ageing` exports a two-sheet workbook: ageing by customer with a totals row, and every open invoice with its band. Amounts are numbers and dates are real Excel dates, so the file filters and sums like a hand-built sheet. CSV files are UTF-8 with a BOM, and text that Excel would run as a formula is prefixed with `'`. Everyone who can see the data can export it, viewers included. The endpoint is `GET /api/export/{cases|customers|payments|ageing}?format=xlsx|csv` with the page's own query parameters (`assignee=me` resolves to the signed-in user).
- **Case owners.** Each case can be assigned to a workspace user (a `public.users` row; in dev mode the demo collectors). The owner shows on the case and in the queue. "My cases" and the owner filter (`?assignee=me`, `none` for unassigned, or a user id) narrow the queue and its export. Managers assign from the case page; every change is audited as `case_assigned` / `case_unassigned` with the previous and new owner.
- **Follow-up log.** On a case, managers log a call: outcome (reached, no answer, promised to pay, disputed), a note and an optional next follow-up date (today or later). Entries are append-only, appear in the paper trail and are audited as `follow_up_logged`. A case's latest entry decides when it is due: the dashboard lists open cases whose next follow-up is today or already late, yours first. Logging a call never changes the case status or creates a payment promise; promises still come from customer replies and are verified against payments.

## Acceptance scenario

`INV-1042` (₹84,000, due 20 Sep 2026) has a reminder, the reply “We will pay on Tuesday”, and an active promise for 29 Sep 2026. Either:

- open `/payments` and apply the held ₹84,000 bank entry to INV-1042, or
- import a payment row for INV-1042 at `/imports`.

The invoice is settled, the promise is marked kept, the case closes and each step is written to the audit log. This path is covered by `tests/repository.test.ts`.

## Daily invoice ledger sync

`/imports` takes today's open-invoice export from your ERP, Tally or Excel sheet, so AERA can replace the daily outstanding sheet rather than sit beside it. Upload the whole file every day; it is safe to re-import.

1. **Preview.** "Preview changes" runs the sync on a copy of the data and shows every row as new, updated, unchanged, flagged or rejected, with the before → after value of each field. Nothing is saved.
2. **Apply.** "Apply sync" commits the same rows. Each change is an audit event with before/after values (`invoice_synced`, `customer_updated`, `invoice_imported`, `invoice_missing_from_ledger`, plus one `invoices_imported` summary).

What a row does:

- **New invoice number**: the invoice is created (and its customer, matched by `customer_code`, then email). If the file has a balance column, the ERP balance becomes the opening position: anything already settled there is recorded as paid before AERA.
- **Known invoice number**: the amount, due date and the customer's name, email, phone, region and account manager are updated from the file. Blank optional cells keep the current value. The status is recomputed, and an amount reduced to exactly what was paid (a credit note) settles the invoice and closes its case.
- **Never below matched payments.** AERA's paid amount is never reduced. An ERP amount lower than what AERA has already recorded as paid is not applied; the invoice is flagged `amount_below_paid`.
- **Rejected per row**: missing fields, due date before invoice date, the same invoice number twice in one file, a currency change, a different `customer_code` than the invoice's customer, an email that belongs to another customer, a balance outside 0 to amount, and invoices cancelled in AERA. The invoice date and currency of a known invoice are not changed by a re-import.

Optional columns:

- **`outstanding`** (also read as `balance`, `balance_due`, `outstanding_amount`, `amount_outstanding`, `closing_balance`, `pending_amount`): the ERP's remaining balance. When it differs from AERA's, AERA keeps its own balance, stores the ERP figure beside it as `erp_outstanding` and flags the invoice `balance_mismatch` with the difference. A later file whose balance agrees clears both; a file without the column leaves them in place.
- **Full ledger mode** (checkbox): the file is the complete open ledger. Open invoices it does not list are flagged `missing_from_ledger` (likely paid or cancelled in the ERP). They are never closed automatically, but the daily monitor stops queueing reminders for them. The flag clears when the invoice reappears in a later file or a payment settles it in AERA.

Flags show next to the invoice on `/customers/[id]`. Template: `public/templates/invoice-import.csv`. API: `POST /api/invoices/import` with form fields `file`, `mode=preview|commit` and `fullLedger=true|false`.

## Design decisions

- **Rules decide, AI describes.** The language model only drafts reminder text and classifies replies. `lib/domain/reply-outcome.ts` deterministically maps a classification to what AERA may do. Disputes, extensions and plan requests always go to a person, even if the classifier did not flag them, and low-confidence results never act automatically.
- **A promise is kept when the money is.** A customer saying they paid never closes a case. Only a matched payment does.
- **Idempotency.** Replies are de-duplicated on the external message id. The daily monitor creates at most one action per invoice and policy step, and never stacks a second open decision on a case. Payment imports reject duplicate references; invoice imports update known invoice numbers instead of duplicating them.
- **Guarded state changes.** Case status moves only along `lib/domain/state-machine.ts`.
- **Audit everything.** Every automated and human mutation appends an `AuditEvent` with actor, reason and data snapshot, matching `audit_events` in the SQL schema.
- **Fixed business date in demo mode.** The mock repository evaluates rules against `DEMO_NOW` (27 Sep 2026) so the seeded story stays coherent. The `repository.today()` contract lets the production adapter use the real clock.

## Configuration

| Variable | Effect |
| --- | --- |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Use the Responses API for drafting and classification instead of the local deterministic fallback |
| `AERA_AUTH_MODE` | `supabase` requires sign-in; `dev` turns authentication off. Defaults to `supabase` when `NEXT_PUBLIC_SUPABASE_URL` is set, else `dev`. Dev mode is refused with a database adapter in production |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project used for sign-in |
| `SUPABASE_SERVICE_ROLE_KEY` | Only read by `npm run db:add-user` to create sign-ins. Never needed by the running app |
| `AERA_INTERNAL_API_TOKEN`, `AERA_AUTOMATION_COMPANY_ID` | n8n service token and the one company it acts for. Accepted only on `/api/automation/*`, `GET /api/collections/actions` and the execution callback. Without a token those routes need a signed-in manager |
| `AERA_DEV_COMPANY_ID`, `AERA_DEV_ROLE`, `AERA_DEV_REGIONS` | Dev mode only: the company, role and regions every request acts as (set `AERA_DEV_ROLE=viewer` to try read-only access, `AERA_DEV_REGIONS=North` to try a regional user) |
| `AERA_DATA_ADAPTER`, `DATABASE_URL` | `postgres` persists everything to PostgreSQL/Supabase; `mock` (default) keeps the in-memory demo |

## Persisting to Supabase / PostgreSQL

1. Put `DATABASE_URL` (Supabase: Project Settings → Database → connection string) and `AERA_DATA_ADAPTER=postgres` in `.env.local`.
2. Apply the schema: `npm run db:migrate` (safe to re-run; a database where `001_initial.sql` was pasted into the SQL editor is detected). `004_collector_workflow.sql` adds the `case_follow_ups` table and clears `collection_cases.assigned_to` values that are not a user of the case's company (older demo seeds stored free-text names there).
3. Create your company and its default policy ladder: `npm run db:create-company -- "Your Company Pvt Ltd" --timezone Asia/Kolkata`. Or load the demo dataset with `npm run db:seed-demo` (its cases start unassigned and without follow-ups, because case owners must be real workspace users).
4. Set up sign-in (next section). For a quick local look without it, set `AERA_AUTH_MODE=dev` and `AERA_DEV_COMPANY_ID` to the printed id; this only works outside production.
5. `npm run dev`. Imports, approvals, payment matches, replies and automation runs are now saved, with every change in `audit_events`.

Each write runs in a transaction under a per-company lock and stores only what changed; see `docs/architecture.md`. n8n: see `n8n/README.md`; workflows stay inactive until credentials are supplied. Gmail is connected inside n8n, never in this app.

## Sign-in with Supabase Auth

Identity comes only from the Supabase session: the app verifies the session JWT, then reads the caller's company and role from their `public.users` row (`public.users.id` = `auth.users.id`). The `x-company-id`, `x-user-id` and `x-user-role` headers are ignored.

1. Complete [Persisting to Supabase / PostgreSQL](#persisting-to-supabase--postgresql) steps 1 to 3 (`AERA_DATA_ADAPTER=postgres` is required: workspace users live in the database).
2. In `.env.local` set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase: Project Settings → API). Auth mode switches to `supabase` automatically.
3. In the Supabase dashboard, Authentication → Sign In / Providers: keep Email enabled and turn **off** "Allow new users to sign up". Self-registered accounts would get no access anyway (no `public.users` row means 403), but there is no reason to allow them.
4. Add people: `npm run db:add-user -- asha@yourco.com --company <company id> --role finance_manager --name "Asha Rao"`. If the email has no sign-in yet, the script creates one (needs `SUPABASE_SERVICE_ROLE_KEY`) and prints an initial password once; otherwise it links the existing sign-in. Re-run it to change someone's role. Add `--regions North,West` to limit someone to some regions (see [Regions](#regions)).
5. `npm run dev`, open `/dashboard` and sign in.

| Role | Access |
| --- | --- |
| `admin`, `finance_manager`, `collection_manager` | Everything in their company, including approve/reject, imports, payment matches, automation jobs, case assignment and the follow-up log |
| `viewer` | Read-only: pages, read APIs and exports work, every mutation answers 403 and its controls are hidden or disabled. A viewer can still own cases |

Any role can also be limited to some regions; it then applies only to customers in those regions.

Signed-out page requests redirect to `/login`, signed-out API calls get 401, and a signed-in account without a `public.users` row is told it has no access. For n8n, set `AERA_INTERNAL_API_TOKEN` and `AERA_AUTOMATION_COMPANY_ID` (see `n8n/README.md`).

## Not in V1 (next phase)

- Self-service account management: password reset, email invitations, and an in-app screen to add users and change roles (today: `npm run db:add-user`). No SSO or MFA enforcement beyond what the Supabase project is configured for.
- One automation token per deployment. Running n8n for several companies needs a token per company.
- Editable policy ladder and per-customer policy overrides.
- Sending email directly from the app. Dispatch from the console is simulated and logged only.
- Partial-payment allocation across several invoices from one bank entry.
- Bulk assignment and auto-assignment rules (by region or account manager); reminders for follow-ups due (today they are listed on the dashboard only); editing or deleting a logged follow-up.
