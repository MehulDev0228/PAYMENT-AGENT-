# AERA V1 architecture

## Boundaries

- `lib/domain`: deterministic financial and collection rules. No LLM calls, no I/O.
  - `policy.ts`: policy ladder and priority.
  - `payment-matching.ts`: invoice number, then reference, then customer and amount. Ambiguity means review, never a guess.
  - `reply-outcome.ts`: maps a reply classification to the permitted operational outcome.
  - `state-machine.ts`: allowed case transitions.
  - `case-views.ts`: named queue views shared by UI and API.
- `lib/data`: tenant-scoped, async repository contract (`repository.ts`). All rules live in `CollectionsEngine` (`engine.ts`), which runs synchronously on one company's in-memory working set. Two adapters host it: `mock-repository.ts` (synthetic seed, fixed business date) and `postgres-repository.ts` (PostgreSQL/Supabase), selected by `AERA_DATA_ADAPTER` in `index.ts`.
- `lib/ai`: replaceable language adapter. It drafts communications from verified facts and classifies replies. It never computes balances or decides outcomes.
- `lib/agent`: read-only question router for Ask AERA. Each answer names the tool that produced it.
- `app/api`: company-scoped REST endpoints, including the automation endpoints n8n calls.
- `app/(marketing)`: public product site.
- `app/(workspace)`: authenticated workspace shell and pages. Server components read the repository directly. Mutations go through API routes (approvals, imports, payment review) or server actions (automation console).
- `n8n/workflows`: importable orchestration definitions. Gmail credentials live in n8n, not in this application.

## Trust model

The repository computes balances, due state, matching and promise outcomes. The AI layer never determines financial facts. Discounts, waivers, terms changes, payment plans, disputes, legal escalation and suspension always enter the human approval queue. Every mutation appends an audit event carrying the actor, the reason and the data snapshot used.

## Main flows

1. **Daily monitor**: overdue invoices are evaluated against the policy. Routine steps queue a reminder; escalation steps queue a single human decision per case.
2. **Reminder dispatch**: n8n asks `/api/automation/reminders/:id/generate` for a draft, sends it via Gmail, then reports back to `/api/collections/actions/:id/executed`.
3. **Reply processing**: n8n posts inbound mail to `/api/automation/replies/process`. The reply is classified, `replyOutcome` decides, and the repository records a promise, raises an approval or simply logs. Calls are idempotent on `externalMessageId`.
4. **Payment import / review**: matched payments are applied immediately. A fully settled invoice fulfils its promise and closes its case. Ambiguous entries wait in `/payments` for a reviewer.
5. **Promise monitor**: promises that have fallen due are marked kept or missed. A missed promise escalates for review.

## Local and production modes

Local development uses the generated fictional dataset through the mock adapter with a fixed business date. Production uses the PostgreSQL adapter:

- **Reads** load the company's working set (customers, invoices, payments, cases, actions, promises, messages, active policy) in one round trip and run the engine on it. A short per-process cache (1.5 s) lets one page's several queries share a load.
- **Writes** run in one transaction: take a per-company advisory lock, reload, run the engine, then upsert only the rows that changed and insert the new audit events. Concurrent writers for a company are serialised, and a failed step leaves no partial state.
- **Audit history** is append-only and never loaded into memory; it is queried directly.
- **Business date** is today in the company's timezone (`companies.timezone`).
- **Tenancy**: the app connects with a server-side role, so every statement is scoped to `company_id` in the adapter. RLS (JWT `company_id` claim) still guards any direct client access.
- **Scale**: loading the working set per call suits a business with up to tens of thousands of open records. Beyond that, move hot reads (lists, search) to targeted SQL behind the same contract.

## Design system

See `design-system/aera-payment-collection-agent/MASTER.md`. Tokens live in `app/globals.css` (hex for CSS, RGB channels for Tailwind opacity) and are mapped in `tailwind.config.ts`. Shared primitives are in `components/ui.tsx`; the workspace shell is in `components/shell/`.
