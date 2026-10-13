import type { ApprovalItem, AuditEvent, CaseDetail, CaseFilter, CaseListItem, CollectionAction, CollectionOverview, CollectionPolicy, Customer, CustomerDetail, CustomerSummary, DataSet, Invoice, Payment, PaymentListItem, PaymentPromise, PromiseItem, SearchResult } from "@/lib/domain/types";
import type { ReplyClassificationInput } from "@/lib/domain/reply-outcome";

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

export interface AeraRepository {
  /** The business date the repository evaluates rules against (fixed in demo mode). */
  today(): string;
  getDataSet(): DataSet;
  overview(companyId: string): CollectionOverview;
  policy(companyId: string): CollectionPolicy;
  listCases(companyId: string, filter?: CaseFilter): CaseListItem[];
  getCase(companyId: string, id: string): CaseDetail | undefined;
  getCustomer(companyId: string, id: string): Customer | undefined;
  listCustomers(companyId: string, q?: string): CustomerSummary[];
  getCustomerDetail(companyId: string, id: string): CustomerDetail | undefined;
  getInvoice(companyId: string, id: string): Invoice | undefined;
  overdueInvoices(companyId: string): Invoice[];
  listPromises(companyId: string): PaymentPromise[];
  listPromiseItems(companyId: string, status?: PaymentPromise["status"]): PromiseItem[];
  listActions(companyId: string, status?: string): CollectionAction[];
  listApprovals(companyId: string, status?: string): ApprovalItem[];
  decideAction(companyId: string, actionId: string, decision: "approved" | "rejected", userId: string, note?: string): CollectionAction;
  markActionExecuted(companyId: string, actionId: string, input: { subject: string; body: string; externalMessageId?: string }): CollectionAction;
  importInvoices(companyId: string, rows: InvoiceImportRow[]): ImportResult;
  importPayments(companyId: string, rows: PaymentImportRow[]): ImportResult;
  listPayments(companyId: string, matchStatus?: Payment["matchStatus"]): PaymentListItem[];
  paymentCandidates(companyId: string, paymentId: string): PaymentCandidate[];
  resolvePayment(companyId: string, paymentId: string, invoiceId: string, userId: string): Payment;
  runDailyMonitor(companyId: string): { reviewed: number; created: number; actions: CollectionAction[] };
  checkPromises(companyId: string): { checked: number; fulfilled: number; missed: number };
  recordReply(companyId: string, input: { from: string; subject: string; body: string; externalMessageId: string }, classification: ReplyClassificationInput): ReplyResult;
  listAudit(companyId: string, filter?: { entityId?: string; entityType?: AuditEvent["entityType"]; limit?: number }): AuditEvent[];
  search(companyId: string, q: string): SearchResult[];
  summary(companyId: string): Record<string, unknown>;
  recentPayments(companyId: string): Payment[];
}
