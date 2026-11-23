export type UserRole = "admin" | "finance_manager" | "collection_manager" | "viewer";
export type InvoiceStatus = "pending" | "partially_paid" | "paid" | "overdue" | "cancelled";
export type CaseStatus =
  | "monitoring"
  | "due"
  | "overdue"
  | "reminder_pending"
  | "reminder_sent"
  | "customer_replied"
  | "payment_promised"
  | "payment_received"
  | "promise_missed"
  | "escalated"
  | "closed";
export type PromiseStatus = "active" | "fulfilled" | "missed" | "cancelled";
export type ActionStatus = "pending" | "awaiting_approval" | "approved" | "executed" | "rejected" | "failed";
export type AutonomyMode = "draft_only" | "routine_automatic" | "human_approval";

export interface Company {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  autonomyMode: AutonomyMode;
  createdAt: string;
}

export interface User {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Customer {
  id: string;
  companyId: string;
  customerCode: string;
  name: string;
  email: string;
  phone?: string;
  region?: string;
  accountManager?: string;
  status: "active" | "on_hold" | "inactive";
  createdAt: string;
}

export interface Invoice {
  id: string;
  companyId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  currency: string;
  amountPaid: number;
  amountOutstanding: number;
  status: InvoiceStatus;
  source: string;
  /** While reconciliationStatus is balance_mismatch: the balance the ERP reported, which KindlyPay did not copy over its own. */
  erpOutstanding?: number;
  /** Set when a ledger sync found something a person must reconcile; KindlyPay's own balance is left as is. */
  reconciliationStatus?: ReconciliationStatus;
  reconciliationNote?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * balance_mismatch: the ERP balance differs from KindlyPay's.
 * missing_from_ledger: a full-ledger sync no longer lists this open invoice (likely paid or cancelled in the ERP).
 * amount_below_paid: the ERP amount is lower than what KindlyPay has already recorded as paid.
 */
export type ReconciliationStatus = "balance_mismatch" | "missing_from_ledger" | "amount_below_paid";

export interface Payment {
  id: string;
  companyId: string;
  invoiceId?: string;
  customerId?: string;
  paymentReference: string;
  amount: number;
  paymentDate: string;
  source: string;
  matchStatus: "matched" | "unmatched" | "payment_match_review_required";
  matchNotes?: string;
  createdAt: string;
}

export interface CollectionCase {
  id: string;
  companyId: string;
  invoiceId: string;
  customerId: string;
  status: CaseStatus;
  priority: "low" | "medium" | "high" | "critical";
  daysOverdue: number;
  nextAction: string;
  nextActionAt?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionAction {
  id: string;
  companyId: string;
  collectionCaseId: string;
  invoiceId: string;
  customerId: string;
  actionType: "reminder" | "follow_up" | "payment_confirmation" | "escalation" | "internal_notification";
  channel: "email" | "internal";
  message: string;
  reason: string;
  dataSnapshot: Record<string, unknown>;
  scheduledAt?: string;
  executedAt?: string;
  status: ActionStatus;
  createdBy: "kindlypay" | "human" | "system";
  approvedBy?: string;
  createdAt: string;
}

export interface PaymentPromise {
  id: string;
  companyId: string;
  invoiceId: string;
  customerId: string;
  promisedAmount?: number;
  promisedDate: string;
  sourceMessageId: string;
  status: PromiseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationMessage {
  id: string;
  companyId: string;
  /** Absent for inbound mail from an unknown sender, which is left for manual triage. */
  customerId?: string;
  invoiceId?: string;
  collectionCaseId?: string;
  channel: "email";
  direction: "inbound" | "outbound";
  externalMessageId?: string;
  subject: string;
  body: string;
  receivedAt?: string;
  processedAt?: string;
}

export type CallOutcome = "reached" | "no_answer" | "promised" | "disputed";

/** A collector's note on a case: what happened on the call and when to try again. */
export interface CaseFollowUp {
  id: string;
  companyId: string;
  collectionCaseId: string;
  customerId: string;
  outcome: CallOutcome;
  note: string;
  nextFollowUpDate?: string;
  createdBy: string;
  createdAt: string;
}

export interface CollectionPolicyStep {
  id: string;
  daysOverdue: number;
  action: "reminder" | "escalation";
  tone: "friendly" | "firm" | "urgent";
  requiresHumanApproval: boolean;
  escalationLevel?: "manager" | "high_priority";
}

export interface CollectionPolicy {
  companyId: string;
  steps: CollectionPolicyStep[];
}

export interface CollectionOverview {
  totalOutstanding: number;
  totalOverdue: number;
  dueThisWeek: number;
  collectedThisMonth: number;
  overdueInvoiceCount: number;
  activeCaseCount: number;
  activePromiseCount: number;
  missedPromiseCount: number;
  aging: Array<{ label: string; amount: number; count: number }>;
}

/** A region's receivables. `region` is null for customers without a region. */
export interface RegionSummary extends CollectionOverview {
  region: string | null;
  customerCount: number;
  /** Active promises dated within the next 7 days (or already past, awaiting the promise check). */
  promisesDueCount: number;
  promisesDueAmount: number;
}

export interface CaseListItem extends CollectionCase {
  invoice: Invoice;
  customer: Customer;
  activePromise?: PaymentPromise;
  /** Name of the workspace user in assignedTo, when that user still exists. */
  assigneeName?: string;
  /** The most recent follow-up logged on the case. */
  lastFollowUp?: CaseFollowUp;
}

export interface CaseDetail extends CaseListItem {
  actions: CollectionAction[];
  communications: CommunicationMessage[];
  promises: PaymentPromise[];
  payments: Payment[];
  followUps: Array<CaseFollowUp & { createdByName?: string }>;
}

export interface AuditEvent {
  id: string;
  companyId: string;
  actorType: "kindlypay" | "human" | "system";
  actorId?: string;
  eventType: string;
  entityType: "invoice" | "customer" | "payment" | "collection_case" | "collection_action" | "payment_promise" | "communication" | "import" | "automation";
  entityId: string;
  reason: string;
  dataSnapshot: Record<string, unknown>;
  createdAt: string;
}

export interface CaseFilter {
  statuses?: CaseStatus[];
  priority?: CollectionCase["priority"];
  q?: string;
  customerId?: string;
  /** A workspace user id, or null for unassigned cases. */
  assignedTo?: string | null;
}

export interface PaymentListItem extends Payment {
  invoiceNumber?: string;
  customerName?: string;
}

export interface CustomerSummary extends Customer {
  outstanding: number;
  overdue: number;
  openInvoices: number;
  openCases: number;
  maxDaysOverdue: number;
}

export interface CustomerDetail extends CustomerSummary {
  invoices: Invoice[];
  cases: CaseListItem[];
  payments: Payment[];
  promises: PaymentPromise[];
}

export interface ApprovalItem extends CollectionAction {
  customerName: string;
  invoiceNumber: string;
  amountOutstanding: number;
  currency: string;
}

export interface PromiseItem extends PaymentPromise {
  customerName: string;
  invoiceNumber: string;
  amountOutstanding: number;
  collectionCaseId?: string;
}

/** A workspace member who can own cases. */
export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface FollowUpDueItem {
  followUp: CaseFollowUp;
  case: CaseListItem;
  /** Days past the planned follow-up date (0 = due today). */
  daysLate: number;
}

export interface AgeingRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  region?: string;
  accountManager?: string;
  notDue: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
  openInvoices: number;
}

export interface AgeingInvoiceRow {
  invoice: Invoice;
  customer: Customer;
  daysOverdue: number;
  bucket: AgeingBucket;
}

export type AgeingBucket = "notDue" | "days1to30" | "days31to60" | "days61to90" | "days90plus";

export interface AgeingReport {
  asOf: string;
  rows: AgeingRow[];
  totals: Omit<AgeingRow, "customerId" | "customerCode" | "customerName" | "region" | "accountManager">;
  invoices: AgeingInvoiceRow[];
}

export interface SearchResult {
  kind: "case" | "customer" | "invoice";
  id: string;
  href: string;
  title: string;
  subtitle: string;
}

export interface DataSet {
  companies: Company[];
  users: User[];
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  cases: CollectionCase[];
  actions: CollectionAction[];
  promises: PaymentPromise[];
  communications: CommunicationMessage[];
  followUps: CaseFollowUp[];
  policies: CollectionPolicy[];
  auditEvents: AuditEvent[];
}
