# AERA: Payment Collection Agent (V1)

Auditable accounts-receivable operations. AERA monitors every invoice, sends routine reminders, records customer promises, verifies them against bank files and reconciles payments, while every financial decision stays with a person.

The local build runs on a deterministic, fictional dataset (200 customers, 1,000 invoices, 560+ payments, an ambiguous bank entry, collection cases, promises and approvals) and needs no external services.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` for the product site and `http://localhost:3000/dashboard` for the workspace. Copy `.env.example` to `.env.local` only when you want to change defaults (see below).

```bash
npm run check   # typecheck + unit/integration tests (both adapters, embedded Postgres)
npm run build   # production build
```

## What is in V1

**Product site** (`/`): marketing page with live numbers from the demo ledger.

**Workspace**

| Route | Purpose |
| --- | --- |
| `/dashboard` | Today's agenda (decisions, promises due, payments to match, missed promises), KPIs, priority cases, ageing, audit activity |
| `/cases`, `/cases/[id]` | Queue with views, search, priority filter and pagination; case paper trail merging emails, payments and audit events |
| `/approvals` | Human decision queue (escalations, disputes, payment-plan requests) with decision history |
| `/promises` | Active / missed / kept / superseded promises |
| `/payments` | Ambiguous-payment review with ranked candidates, and the full payment ledger |
| `/customers`, `/customers/[id]` | Exposure by customer, invoices, payments and promise record |
| `/imports` | CSV/XLSX invoice and payment import with row-level validation and duplicate rejection |
| `/automation` | Run the daily monitor, simulated reminder dispatch, promise check and reply processing by hand |
| `/ask` | Read-only questions answered by named repository tools, with tabular evidence |
| `/policy` | Policy ladder and hard limits |

Press `Ctrl K` / `⌘ K` anywhere in the workspace to search invoices, customers and pages.

## Acceptance scenario

`INV-1042` (₹84,000, due 20 Sep 2026) has a reminder, the reply “We will pay on Tuesday”, and an active promise for 29 Sep 2026. Either:

- open `/payments` and apply the held ₹84,000 bank entry to INV-1042, or
- import a payment row for INV-1042 at `/imports`.

The invoice is settled, the promise is marked kept, the case closes and each step is written to the audit log. This path is covered by `tests/repository.test.ts`.

## Design decisions

- **Rules decide, AI describes.** The language model only drafts reminder text and classifies replies. `lib/domain/reply-outcome.ts` deterministically maps a classification to what AERA may do. Disputes, extensions and plan requests always go to a person, even if the classifier did not flag them, and low-confidence results never act automatically.
- **A promise is kept when the money is.** A customer saying they paid never closes a case. Only a matched payment does.
- **Idempotency.** Replies are de-duplicated on the external message id. The daily monitor creates at most one action per invoice and policy step, and never stacks a second open decision on a case. Payment imports reject duplicate references.
- **Guarded state changes.** Case status moves only along `lib/domain/state-machine.ts`.
- **Audit everything.** Every automated and human mutation appends an `AuditEvent` with actor, reason and data snapshot, matching `audit_events` in the SQL schema.
- **Fixed business date in demo mode.** The mock repository evaluates rules against `DEMO_NOW` (27 Sep 2026) so the seeded story stays coherent. The `repository.today()` contract lets the production adapter use the real clock.

## Configuration

| Variable | Effect |
| --- | --- |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Use the Responses API for drafting and classification instead of the local deterministic fallback |
| `AERA_INTERNAL_API_TOKEN` | When set, `/api/automation/*` and the execution callback require `Authorization: Bearer <token>` (used by n8n). The workspace's automation console uses server actions and is unaffected |
| `AERA_DEV_COMPANY_ID` | Company used for unauthenticated local requests |
| `AERA_DATA_ADAPTER`, `DATABASE_URL` | `postgres` persists everything to PostgreSQL/Supabase; `mock` (default) keeps the in-memory demo |

## Persisting to Supabase / PostgreSQL

1. Put `DATABASE_URL` (Supabase: Project Settings → Database → connection string) and `AERA_DATA_ADAPTER=postgres` in `.env.local`.
2. Apply the schema: `npm run db:migrate` (safe to re-run; a database where `001_initial.sql` was pasted into the SQL editor is detected).
3. Create your company and its default policy ladder: `npm run db:create-company -- "Your Company Pvt Ltd" --timezone Asia/Kolkata`, then set the printed `AERA_DEV_COMPANY_ID`. Or load the demo dataset with `npm run db:seed-demo`.
4. `npm run dev`. Imports, approvals, payment matches, replies and automation runs are now saved, with every change in `audit_events`.

Each write runs in a transaction under a per-company lock and stores only what changed; see `docs/architecture.md`. n8n: see `n8n/README.md`; workflows stay inactive until credentials are supplied. Gmail is connected inside n8n, never in this app.

## Not in V1 (next phase)

- Real authentication. The current request context is a demo identity taken from headers or `AERA_DEV_COMPANY_ID`.
- Editable policy ladder and per-customer policy overrides.
- Sending email directly from the app. Dispatch from the console is simulated and logged only.
- Partial-payment allocation across several invoices from one bank entry.
