import type { AgeingReport, ApprovalItem, AuditEvent, CallOutcome, CaseDetail, CaseFilter, CaseFollowUp, CaseListItem, CollectionAction, CollectionCase, CollectionOverview, CollectionPolicy, Customer, CustomerDetail, CustomerSummary, FollowUpDueItem, Invoice, Payment, PaymentListItem, PaymentPromise, PromiseItem, SearchResult, WorkspaceUser } from "@/lib/domain/types";
import type { ReplyClassificationInput } from "@/lib/domain/reply-outcome";
import type { CollectionsEngine } from "./engine";

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

export interface FollowUpInput {
  outcome: CallOutcome;
  note?: string;
  /** YYYY-MM-DD, today or later. Omit when no further call is planned. */
  nextFollowUpDate?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AeraRepository {
  /** The business date the repository evaluates rules against (fixed in demo mode). */
  today(companyId: string): Promise<string>;
  overview(companyId: string): Promise<CollectionOverview>;
  policy(companyId: string): Promise<CollectionPolicy>;
  listCases(companyId: string, filter?: CaseFilter): Promise<CaseListItem[]>;
  getCase(companyId: string, id: string): Promise<CaseDetail | undefined>;
  getCustomer(companyId: string, id: string): Promise<Customer | undefined>;
  listCustomers(companyId: string, q?: string): Promise<CustomerSummary[]>;
  getCustomerDetail(companyId: string, id: string): Promise<CustomerDetail | undefined>;
  getInvoice(companyId: string, id: string): Promise<Invoice | undefined>;
  overdueInvoices(companyId: string): Promise<Invoice[]>;
  listPromises(companyId: string): Promise<PaymentPromise[]>;
  listPromiseItems(companyId: string, status?: PaymentPromise["status"]): Promise<PromiseItem[]>;
  listActions(companyId: string, status?: string): Promise<CollectionAction[]>;
  listApprovals(companyId: string, status?: string): Promise<ApprovalItem[]>;
  decideAction(companyId: string, actionId: string, decision: "approved" | "rejected", userId: string, note?: string): Promise<CollectionAction>;
  markActionExecuted(companyId: string, actionId: string, input: { subject: string; body: string; externalMessageId?: string }): Promise<CollectionAction>;
  importInvoices(companyId: string, rows: InvoiceImportRow[], userId?: string): Promise<ImportResult>;
  importPayments(companyId: string, rows: PaymentImportRow[]): Promise<ImportResult>;
  listPayments(companyId: string, matchStatus?: Payment["matchStatus"]): Promise<PaymentListItem[]>;
  paymentCandidates(companyId: string, paymentId: string): Promise<PaymentCandidate[]>;
  resolvePayment(companyId: string, paymentId: string, invoiceId: string, userId: string): Promise<Payment>;
  runDailyMonitor(companyId: string): Promise<{ reviewed: number; created: number; actions: CollectionAction[] }>;
  checkPromises(companyId: string): Promise<{ checked: number; fulfilled: number; missed: number }>;
  recordReply(companyId: string, input: { from: string; subject: string; body: string; externalMessageId: string }, classification: ReplyClassificationInput): Promise<ReplyResult>;
  listAudit(companyId: string, filter?: AuditFilter): Promise<AuditEvent[]>;
  search(companyId: string, q: string): Promise<SearchResult[]>;
  summary(companyId: string): Promise<Record<string, unknown>>;
  recentPayments(companyId: string): Promise<Payment[]>;
  /** Workspace members (public.users) who can own cases. */
  listUsers(companyId: string): Promise<WorkspaceUser[]>;
  followUpsDue(companyId: string): Promise<FollowUpDueItem[]>;
  ageingReport(companyId: string): Promise<AgeingReport>;
  assignCase(companyId: string, caseId: string, assigneeId: string | null, actorId: string): Promise<CollectionCase>;
  logFollowUp(companyId: string, caseId: string, input: FollowUpInput, actorId: string): Promise<CaseFollowUp>;
}

export interface AuditFilter { entityId?: string; entityType?: AuditEvent["entityType"]; limit?: number }

/**
 * Runs one engine call for a company. "read" calls see a consistent snapshot;
 * "write" calls are serialised per company and their changes are persisted atomically.
 */
export type EngineRunner = <T>(companyId: string, mode: "read" | "write", fn: (engine: CollectionsEngine) => T) => Promise<T>;

/** Builds the repository contract on top of a storage adapter's runner, so every adapter exposes identical behaviour. */
export function createRepository(run: EngineRunner, listAudit: AeraRepository["listAudit"]): AeraRepository {
  return {
    today: (c) => run(c, "read", (e) => e.today()),
    overview: (c) => run(c, "read", (e) => e.overview(c)),
    policy: (c) => run(c, "read", (e) => e.policy(c)),
    listCases: (c, filter) => run(c, "read", (e) => e.listCases(c, filter)),
    getCase: (c, id) => run(c, "read", (e) => e.getCase(c, id)),
    getCustomer: (c, id) => run(c, "read", (e) => e.getCustomer(c, id)),
    listCustomers: (c, q) => run(c, "read", (e) => e.listCustomers(c, q)),
    getCustomerDetail: (c, id) => run(c, "read", (e) => e.getCustomerDetail(c, id)),
    getInvoice: (c, id) => run(c, "read", (e) => e.getInvoice(c, id)),
    overdueInvoices: (c) => run(c, "read", (e) => e.overdueInvoices(c)),
    listPromises: (c) => run(c, "read", (e) => e.listPromises(c)),
    listPromiseItems: (c, status) => run(c, "read", (e) => e.listPromiseItems(c, status)),
    listActions: (c, status) => run(c, "read", (e) => e.listActions(c, status)),
    listApprovals: (c, status) => run(c, "read", (e) => e.listApprovals(c, status)),
    listPayments: (c, matchStatus) => run(c, "read", (e) => e.listPayments(c, matchStatus)),
    paymentCandidates: (c, id) => run(c, "read", (e) => e.paymentCandidates(c, id)),
    search: (c, q) => run(c, "read", (e) => e.search(c, q)),
    summary: (c) => run(c, "read", (e) => e.summary(c)),
    recentPayments: (c) => run(c, "read", (e) => e.recentPayments(c)),
    listUsers: (c) => run(c, "read", (e) => e.listUsers(c)),
    followUpsDue: (c) => run(c, "read", (e) => e.followUpsDue(c)),
    ageingReport: (c) => run(c, "read", (e) => e.ageingReport(c)),
    listAudit,
    decideAction: (c, id, decision, userId, note) => run(c, "write", (e) => e.decideAction(c, id, decision, userId, note)),
    markActionExecuted: (c, id, input) => run(c, "write", (e) => e.markActionExecuted(c, id, input)),
    importInvoices: (c, rows, userId) => run(c, "write", (e) => e.importInvoices(c, rows, userId)),
    importPayments: (c, rows) => run(c, "write", (e) => e.importPayments(c, rows)),
    resolvePayment: (c, paymentId, invoiceId, userId) => run(c, "write", (e) => e.resolvePayment(c, paymentId, invoiceId, userId)),
    runDailyMonitor: (c) => run(c, "write", (e) => e.runDailyMonitor(c)),
    checkPromises: (c) => run(c, "write", (e) => e.checkPromises(c)),
    recordReply: (c, input, classification) => run(c, "write", (e) => e.recordReply(c, input, classification)),
    assignCase: (c, caseId, assigneeId, actorId) => run(c, "write", (e) => e.assignCase(c, caseId, assigneeId, actorId)),
    logFollowUp: (c, caseId, input, actorId) => run(c, "write", (e) => e.logFollowUp(c, caseId, input, actorId)),
  };
}
