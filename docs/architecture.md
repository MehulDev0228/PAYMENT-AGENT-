# AERA V1 architecture

## Boundaries

- `lib/domain`: deterministic financial and collection rules. No LLM calls, no I/O.
  - `policy.ts`: policy ladder and priority.
  - `payment-matching.ts`: invoice number, then reference, then customer and amount. Ambiguity means review, never a guess.
  - `reply-outcome.ts`: maps a reply classification to the permitted operational outcome.
  - `state-machine.ts`: allowed case transitions.
  - `case-views.ts`: named queue views shared by UI and API.
  - `collector.ts`: call outcomes, ageing bands and the owner filter (`me` / `none` / user id).
- `lib/data`: tenant-scoped, async repository contract (`repository.ts`). All rules live in `CollectionsEngine` (`engine.ts`), which runs synchronously on one company's in-memory working set. Two adapters host it: `mock-repository.ts` (synthetic seed, fixed business date) and `postgres-repository.ts` (PostgreSQL/Supabase), selected by `AERA_DATA_ADAPTER` in `index.ts`.
- `lib/ai`: replaceable language adapter. It drafts communications from verified facts and classifies replies. It never computes balances or decides outcomes.
- `lib/auth`: who is calling. `context.ts` derives company, user and role from a verified Supabase session plus the caller's `public.users` row, or from the n8n token on automation routes, and holds the permission checks. Request headers never carry identity.
- `lib/exports.ts`: spreadsheet exports. Builds each report from the same repository calls and filters as its page, then writes `.xlsx` (write-excel-file) or CSV.
- `lib/agent`: read-only question router for Ask AERA. Each answer names the tool that produced it.
- `app/api`: company-scoped REST endpoints, including the automation endpoints n8n calls.
- `app/(marketing)`: public product site.
- `proxy.ts`: refreshes the Supabase session and turns away signed-out requests (pages redirect to `/login`, API routes answer 401).
- `app/(workspace)`: authenticated workspace shell and pages. Server components read the repository directly. Mutations go through API routes (approvals, imports, payment review, case assignment, follow-ups) or server actions (automation console).
- `n8n/workflows`: importable orchestration definitions. Gmail credentials live in n8n, not in this application.

## Trust model

The repository computes balances, due state, matching and promise outcomes. The AI layer never determines financial facts. Discounts, waivers, terms changes, payment plans, disputes, legal escalation and suspension always enter the human approval queue. Every mutation appends an audit event carrying the actor, the reason and the data snapshot used.

## Access control

| Caller | How it is identified | May |
| --- | --- | --- |
| Admin, finance manager, collection manager | Supabase session → `public.users` (company, role) | Read everything in their company; approve/reject, import, apply payment matches, run automation jobs |
| Viewer | Same | Read only. Every mutation answers 403 and the UI hides or disables its controls |
| n8n | `Authorization: Bearer $AERA_INTERNAL_API_TOKEN`, bound to `AERA_AUTOMATION_COMPANY_ID` | `/api/automation/*`, the action queue (`GET /api/collections/actions`) and the execution callback. Never approvals, imports or payment matches |

Dev mode (`AERA_AUTH_MODE=dev`, the default when no Supabase project is configured) skips sign-in and acts as a demo finance manager. It is refused for a database adapter in production.

## Main flows

1. **Daily monitor**: overdue invoices are evaluated against the policy. Routine steps queue a reminder; escalation steps queue a single human decision per case.
2. **Reminder dispatch**: n8n asks `/api/automation/reminders/:id/generate` for a draft, sends it via Gmail, then reports back to `/api/collections/actions/:id/executed`.
3. **Reply processing**: n8n posts inbound mail to `/api/automation/replies/process`. The reply is classified, `replyOutcome` decides, and the repository records a promise, raises an approval or simply logs. Calls are idempotent on `externalMessageId`.
4. **Payment import / review**: matched payments are applied immediately. A fully settled invoice fulfils its promise and closes its case. Ambiguous entries wait in `/payments` for a reviewer.
5. **Promise monitor**: promises that have fallen due are marked kept or missed. A missed promise escalates for review.

## Local and production modes

Local development uses the generated fictional dataset through the mock adapter with a fixed business date. Production uses the PostgreSQL adapter:

- **Reads** load the company's working set (customers, invoices, payments, cases, actions, promises, messages, follow-ups, workspace users, active policy) in one round trip and run the engine on it. A short per-process cache (1.5 s) lets one page's several queries share a load.
- **Writes** run in one transaction: take a per-company advisory lock, reload, run the engine, then upsert only the rows that changed and insert the new audit events. Concurrent writers for a company are serialised, and a failed step leaves no partial state.
- **Audit history** is append-only and never loaded into memory; it is queried directly.
- **Workspace users** (`public.users`) are loaded read-only so the engine can validate case owners and show names; they are only written by `npm run db:add-user`.
- **Business date** is today in the company's timezone (`companies.timezone`).
- **Tenancy**: the app connects with a server-side role, so every statement is scoped to `company_id` in the adapter. RLS (JWT `company_id` claim) still guards any direct client access.
- **Scale**: loading the working set per call suits a business with up to tens of thousands of open records. Beyond that, move hot reads (lists, search) to targeted SQL behind the same contract.

## Design system

See `design-system/aera-payment-collection-agent/MASTER.md`. Tokens live in `app/globals.css` (hex for CSS, RGB channels for Tailwind opacity) and are mapped in `tailwind.config.ts`. Shared primitives are in `components/ui.tsx`; the workspace shell is in `components/shell/`.
