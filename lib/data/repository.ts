import { AuthError } from "@/lib/auth/context";
import { inRegions } from "@/lib/domain/regions";
import type { ApprovalItem, AuditEvent, CaseDetail, CaseFilter, CaseListItem, CollectionAction, CollectionOverview, CollectionPolicy, Customer, CustomerDetail, CustomerSummary, Invoice, Payment, PaymentListItem, PaymentPromise, PromiseItem, RegionSummary, SearchResult } from "@/lib/domain/types";
import type { ReplyClassificationInput } from "@/lib/domain/reply-outcome";
import { customerView, type CollectionsEngine } from "./engine";

export interface InvoiceImportRow {
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  currency: string;
  customer_code?: string;
  customer_phone?: string;
  region?: string;
  account_manager?: string;
}

export interface PaymentImportRow {
  payment_reference: string;
  invoice_number?: string;
  amount: number;
  payment_date: string;
  customer_code?: string;
}

export interface ImportResult {
  imported: number;
  rejected: number;
  reviewRequired: number;
  errors: Array<{ row: number; message: string }>;
}

export interface ReplyResult {
  intent: string;
  caseId?: string;
  promiseId?: string;
  approvalActionId?: string;
  requiresHuman: boolean;
  confidence: number;
  duplicate: boolean;
  outcome: string;
}

export interface PaymentCandidate {
  invoice: Invoice;
  customerName: string;
  reason: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The slice of one company's data a call may see and change. `regions: null` is every region; a list limits
 * the call to customers in those regions and their invoices, payments, cases, actions, promises and messages.
 * Rows outside the scope do not exist for the call: reads leave them out, lookups return undefined and
 * writes fail with "not found". A RequestContext is a DataScope, so callers pass the caller's context.
 */
export interface DataScope { companyId: string; regions: readonly string[] | null }

/** Every region of a company: automation jobs, scripts and tests. */
export const companyScope = (companyId: string): DataScope => ({ companyId, regions: null });

/**
 * Narrows a scope to one region, for the ?region= filter on reads. A region outside the caller's
 * regions gives an empty view, never a wider one.
 */
export function withRegion(scope: DataScope, region?: string | null): DataScope {
  const wanted = region?.trim();
  if (!wanted) return { companyId: scope.companyId, regions: scope.regions };
  return { companyId: scope.companyId, regions: inRegions(wanted, scope.regions) ? [wanted] : [] };
}

export interface AeraRepository {
  /** The business date the repository evaluates rules against (fixed in demo mode). */
  today(scope: DataScope): Promise<string>;
  overview(scope: DataScope): Promise<CollectionOverview>;
  policy(scope: DataScope): Promise<CollectionPolicy>;
  /** The regions of the customers in scope, for region pickers. */
  regions(scope: DataScope): Promise<string[]>;
  /** Outstanding, overdue, ageing, promises due and collections per region in scope. */
  regionSummary(scope: DataScope): Promise<RegionSummary[]>;
  listCases(scope: DataScope, filter?: CaseFilter): Promise<CaseListItem[]>;
  getCase(scope: DataScope, id: string): Promise<CaseDetail | undefined>;
  getCustomer(scope: DataScope, id: string): Promise<Customer | undefined>;
  listCustomers(scope: DataScope, q?: string): Promise<CustomerSummary[]>;
  getCustomerDetail(scope: DataScope, id: string): Promise<CustomerDetail | undefined>;
  getInvoice(scope: DataScope, id: string): Promise<Invoice | undefined>;
  overdueInvoices(scope: DataScope): Promise<Invoice[]>;
  listPromises(scope: DataScope): Promise<PaymentPromise[]>;
  listPromiseItems(scope: DataScope, status?: PaymentPromise["status"]): Promise<PromiseItem[]>;
  listActions(scope: DataScope, status?: string): Promise<CollectionAction[]>;
  listApprovals(scope: DataScope, status?: string): Promise<ApprovalItem[]>;
  decideAction(scope: DataScope, actionId: string, decision: "approved" | "rejected", userId: string, note?: string): Promise<CollectionAction>;
  markActionExecuted(scope: DataScope, actionId: string, input: { subject: string; body: string; externalMessageId?: string }): Promise<CollectionAction>;
  /** A regional scope may import invoices of its own regions only; other rows are rejected. */
  importInvoices(scope: DataScope, rows: InvoiceImportRow[], userId?: string): Promise<ImportResult>;
  /** Bank files span every region, so payment imports need a scope with every region. */
  importPayments(scope: DataScope, rows: PaymentImportRow[]): Promise<ImportResult>;
  /** Payments not yet tied to a customer belong to no region: only a scope with every region sees them. */
  listPayments(scope: DataScope, matchStatus?: Payment["matchStatus"]): Promise<PaymentListItem[]>;
  paymentCandidates(scope: DataScope, paymentId: string): Promise<PaymentCandidate[]>;
  resolvePayment(scope: DataScope, paymentId: string, invoiceId: string, userId: string): Promise<Payment>;
  runDailyMonitor(scope: DataScope): Promise<{ reviewed: number; created: number; actions: CollectionAction[] }>;
  checkPromises(scope: DataScope): Promise<{ checked: number; fulfilled: number; missed: number }>;
  recordReply(scope: DataScope, input: { from: string; subject: string; body: string; externalMessageId: string }, classification: ReplyClassificationInput): Promise<ReplyResult>;
  /** A regional scope sees the events of rows in its regions only, not company-wide imports and job runs. */
  listAudit(scope: DataScope, filter?: AuditFilter): Promise<AuditEvent[]>;
  search(scope: DataScope, q: string): Promise<SearchResult[]>;
  summary(scope: DataScope): Promise<Record<string, unknown>>;
  recentPayments(scope: DataScope): Promise<Payment[]>;
}

export interface AuditFilter { entityId?: string; entityType?: AuditEvent["entityType"]; limit?: number }

/** How an adapter reads audit events. `entityIds` limits them to those entities (a regional scope). */
export type AuditReader = (companyId: string, filter: AuditFilter & { entityIds?: readonly string[] }) => Promise<AuditEvent[]>;

/**
 * Runs one engine call for a company. "read" calls see a consistent snapshot;
 * "write" calls are serialised per company and their changes are persisted atomically.
 */
export type EngineRunner = <T>(companyId: string, mode: "read" | "write", fn: (engine: CollectionsEngine) => T) => Promise<T>;

/**
 * Builds the repository contract on top of a storage adapter's runner, so every adapter exposes identical behaviour.
 * Region scope is applied here, once for every adapter: the engine runs on the scope's view of the working set,
 * so it cannot read or change a row outside the caller's regions.
 */
export function createRepository(runCompany: EngineRunner, readAudit: AuditReader): AeraRepository {
  const run = <T>(scope: DataScope, mode: "read" | "write", fn: (engine: CollectionsEngine) => T): Promise<T> =>
    runCompany(scope.companyId, mode, (engine) => {
      const { regions } = scope;
      if (regions === null) return fn(engine);
      const view = customerView(engine.data, (customer) => inRegions(customer.region, regions));
      const result = fn(engine.withData(view.data));
      if (mode === "write") view.commit();
      return result;
    });

  return {
    today: (s) => run(s, "read", (e) => e.today()),
    overview: (s) => run(s, "read", (e) => e.overview(s.companyId)),
    policy: (s) => run(s, "read", (e) => e.policy(s.companyId)),
    regions: (s) => run(s, "read", (e) => e.regions(s.companyId)),
    regionSummary: (s) => run(s, "read", (e) => e.regionSummary(s.companyId)),
    listCases: (s, filter) => run(s, "read", (e) => e.listCases(s.companyId, filter)),
    getCase: (s, id) => run(s, "read", (e) => e.getCase(s.companyId, id)),
    getCustomer: (s, id) => run(s, "read", (e) => e.getCustomer(s.companyId, id)),
    listCustomers: (s, q) => run(s, "read", (e) => e.listCustomers(s.companyId, q)),
    getCustomerDetail: (s, id) => run(s, "read", (e) => e.getCustomerDetail(s.companyId, id)),
    getInvoice: (s, id) => run(s, "read", (e) => e.getInvoice(s.companyId, id)),
    overdueInvoices: (s) => run(s, "read", (e) => e.overdueInvoices(s.companyId)),
    listPromises: (s) => run(s, "read", (e) => e.listPromises(s.companyId)),
    listPromiseItems: (s, status) => run(s, "read", (e) => e.listPromiseItems(s.companyId, status)),
    listActions: (s, status) => run(s, "read", (e) => e.listActions(s.companyId, status)),
    listApprovals: (s, status) => run(s, "read", (e) => e.listApprovals(s.companyId, status)),
    listPayments: (s, matchStatus) => run(s, "read", (e) => e.listPayments(s.companyId, matchStatus)),
    paymentCandidates: (s, id) => run(s, "read", (e) => e.paymentCandidates(s.companyId, id)),
    search: (s, q) => run(s, "read", (e) => e.search(s.companyId, q)),
    summary: (s) => run(s, "read", (e) => e.summary(s.companyId)),
    recentPayments: (s) => run(s, "read", (e) => e.recentPayments(s.companyId)),
    listAudit: async (s, filter = {}) => {
      if (s.regions === null) return readAudit(s.companyId, filter);
      const entityIds = await run(s, "read", (e) => e.entityIds());
      return readAudit(s.companyId, { ...filter, entityIds });
    },
    decideAction: (s, id, decision, userId, note) => run(s, "write", (e) => e.decideAction(s.companyId, id, decision, userId, note)),
    markActionExecuted: (s, id, input) => run(s, "write", (e) => e.markActionExecuted(s.companyId, id, input)),
    // Imports run on the whole company so duplicate checks and customer matching see every region.
    importInvoices: (s, rows, userId) => runCompany(s.companyId, "write", (e) => e.importInvoices(s.companyId, rows, userId, s.regions)),
    importPayments: async (s, rows) => {
      if (s.regions !== null) throw new AuthError(403, "Bank files cover every region. Ask a user with access to all regions to import payments.");
      return runCompany(s.companyId, "write", (e) => e.importPayments(s.companyId, rows));
    },
    resolvePayment: (s, paymentId, invoiceId, userId) => run(s, "write", (e) => e.resolvePayment(s.companyId, paymentId, invoiceId, userId)),
    runDailyMonitor: (s) => run(s, "write", (e) => e.runDailyMonitor(s.companyId)),
    checkPromises: (s) => run(s, "write", (e) => e.checkPromises(s.companyId)),
    recordReply: (s, input, classification) => run(s, "write", (e) => e.recordReply(s.companyId, input, classification)),
  };
}
