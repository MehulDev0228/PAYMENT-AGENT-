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
  createdAt: string;
  updatedAt: string;
}

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
  createdBy: "aera" | "human" | "system";
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
  customerId: string;
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

export interface CaseListItem extends CollectionCase {
  invoice: Invoice;
  customer: Customer;
  activePromise?: PaymentPromise;
}

export interface CaseDetail extends CaseListItem {
  actions: CollectionAction[];
  communications: CommunicationMessage[];
  promises: PaymentPromise[];
  payments: Payment[];
}

export interface AuditEvent {
  id: string;
  companyId: string;
  actorType: "aera" | "human" | "system";
  actorId?: string;
  eventType: string;
  entityType: "invoice" | "payment" | "collection_case" | "collection_action" | "payment_promise" | "communication" | "import" | "automation";
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
  policies: CollectionPolicy[];
  auditEvents: AuditEvent[];
}
