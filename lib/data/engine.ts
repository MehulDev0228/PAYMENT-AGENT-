import { randomUUID } from "node:crypto";
import { daysBetween, formatMoney, isoDate } from "@/lib/domain/money";
import { matchPayment } from "@/lib/domain/payment-matching";
import { applicablePolicyStep, priorityFor } from "@/lib/domain/policy";
import { replyOutcome, type ReplyClassificationInput } from "@/lib/domain/reply-outcome";
import { canTransition } from "@/lib/domain/state-machine";
import { OPEN_CASE_STATUSES } from "@/lib/domain/case-views";
import type {
  ApprovalItem, AuditEvent, CaseDetail, CaseFilter, CaseListItem, CaseStatus, CollectionAction, CollectionCase, CollectionOverview,
  Customer, CustomerDetail, CustomerSummary, DataSet, Invoice, Payment, PaymentListItem, PromiseItem, SearchResult,
} from "@/lib/domain/types";
import type { AuditFilter, ImportResult, InvoiceImportRow, PaymentCandidate, PaymentImportRow, ReplyResult } from "./repository";

const PRIORITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 } as const;
const OPEN_INVOICE = (invoice: Invoice) => invoice.status !== "cancelled" && invoice.amountOutstanding > 0;

type Actor = { type: AuditEvent["actorType"]; id?: string };
const AERA: Actor = { type: "aera" };
const SYSTEM: Actor = { type: "system" };

/**
 * All collection rules, applied synchronously to an in-memory DataSet.
 * Storage adapters load a company's data, run one engine call and persist what changed,
 * so the mock and the database share exactly the same behaviour.
 */
export class CollectionsEngine {
  constructor(readonly data: DataSet, private readonly now: Date) {}

  today() { return isoDate(this.now); }
  policy(companyId: string) { return this.data.policies.find((item) => item.companyId === companyId)!; }

  // ---------------------------------------------------------------- reads

  overview(companyId: string): CollectionOverview {
    const invoices = this.invoicesOf(companyId).filter((item) => item.status !== "cancelled");
    const activeCases = this.data.cases.filter((item) => item.companyId === companyId && item.status !== "closed");
    const overdue = invoices.filter((item) => item.amountOutstanding > 0 && new Date(item.dueDate) < this.now);
    const dueEnd = new Date(this.now); dueEnd.setUTCDate(dueEnd.getUTCDate() + 7);
    const startMonth = `${this.today().slice(0, 7)}-01`;
    const agingDefs = [
      { label: "Current", min: -9999, max: 0 },
      { label: "1–7 days", min: 1, max: 7 },
      { label: "8–15 days", min: 8, max: 15 },
      { label: "16–30 days", min: 16, max: 30 },
      { label: "30+ days", min: 31, max: 9999 },
    ];
    return {
      totalOutstanding: sum(invoices.map((item) => item.amountOutstanding)),
      totalOverdue: sum(overdue.map((item) => item.amountOutstanding)),
      dueThisWeek: sum(invoices.filter((item) => item.amountOutstanding > 0 && new Date(item.dueDate) >= this.now && new Date(item.dueDate) <= dueEnd).map((item) => item.amountOutstanding)),
      collectedThisMonth: sum(this.data.payments.filter((item) => item.companyId === companyId && item.paymentDate >= startMonth && item.matchStatus === "matched").map((item) => item.amount)),
      overdueInvoiceCount: overdue.length,
      activeCaseCount: activeCases.length,
      activePromiseCount: this.data.promises.filter((item) => item.companyId === companyId && item.status === "active").length,
      missedPromiseCount: this.data.promises.filter((item) => item.companyId === companyId && item.status === "missed").length,
      aging: agingDefs.map((definition) => {
        const bucket = invoices.filter((item) => {
          const days = new Date(item.dueDate) < this.now ? daysBetween(item.dueDate, this.now) : 0;
          return item.amountOutstanding > 0 && days >= definition.min && days <= definition.max;
        });
        return { label: definition.label, amount: sum(bucket.map((item) => item.amountOutstanding)), count: bucket.length };
      }),
    };
  }

  listCases(companyId: string, filter: CaseFilter = {}): CaseListItem[] {
    const invoices = this.indexById(this.invoicesOf(companyId));
    const customers = this.indexById(this.data.customers.filter((item) => item.companyId === companyId));
    const activePromises = new Map(this.data.promises.filter((item) => item.companyId === companyId && item.status === "active").map((item) => [item.invoiceId, item]));
    const q = filter.q?.trim().toLowerCase();
    return this.data.cases
      .filter((item) => item.companyId === companyId)
      .filter((item) => !filter.statuses?.length || filter.statuses.includes(item.status))
      .filter((item) => !filter.priority || item.priority === filter.priority)
      .filter((item) => !filter.customerId || item.customerId === filter.customerId)
      .map((item) => ({ ...item, invoice: invoices.get(item.invoiceId)!, customer: customers.get(item.customerId)!, activePromise: activePromises.get(item.invoiceId) }))
      .filter((item) => !q || item.customer.name.toLowerCase().includes(q) || item.invoice.invoiceNumber.toLowerCase().includes(q) || item.customer.customerCode.toLowerCase().includes(q))
      .sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed")
        || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
        || b.daysOverdue - a.daysOverdue
        || b.invoice.amountOutstanding - a.invoice.amountOutstanding);
  }

  getCase(companyId: string, id: string): CaseDetail | undefined {
    const record = this.data.cases.find((item) => item.companyId === companyId && item.id === id);
    if (!record) return undefined;
    const item = this.listCases(companyId, { customerId: record.customerId }).find((candidate) => candidate.id === id)!;
    return {
      ...item,
      actions: this.data.actions.filter((action) => action.collectionCaseId === id),
      communications: this.data.communications.filter((message) => message.collectionCaseId === id),
      promises: this.data.promises.filter((promise) => promise.invoiceId === item.invoiceId),
      payments: this.data.payments.filter((payment) => payment.invoiceId === item.invoiceId),
    };
  }

  getCustomer(companyId: string, id: string) { return this.data.customers.find((item) => item.companyId === companyId && item.id === id); }
  getInvoice(companyId: string, id: string) { return this.data.invoices.find((item) => item.companyId === companyId && item.id === id); }
  overdueInvoices(companyId: string) { return this.invoicesOf(companyId).filter((item) => OPEN_INVOICE(item) && new Date(item.dueDate) < this.now); }
  listPromises(companyId: string) { return this.data.promises.filter((item) => item.companyId === companyId); }
  listActions(companyId: string, status?: string) { return this.data.actions.filter((item) => item.companyId === companyId && (!status || item.status === status)); }
  recentPayments(companyId: string) { return this.listPayments(companyId).slice(0, 50); }

  listCustomers(companyId: string, q?: string): CustomerSummary[] {
    const needle = q?.trim().toLowerCase();
    const byCustomer = new Map<string, CustomerSummary>();
    for (const customer of this.data.customers) {
      if (customer.companyId !== companyId) continue;
      if (needle && !`${customer.name} ${customer.customerCode} ${customer.email}`.toLowerCase().includes(needle)) continue;
      byCustomer.set(customer.id, { ...customer, outstanding: 0, overdue: 0, openInvoices: 0, openCases: 0, maxDaysOverdue: 0 });
    }
    for (const invoice of this.invoicesOf(companyId)) {
      const summary = byCustomer.get(invoice.customerId);
      if (!summary || !OPEN_INVOICE(invoice)) continue;
      summary.outstanding += invoice.amountOutstanding; summary.openInvoices += 1;
      if (new Date(invoice.dueDate) < this.now) {
        summary.overdue += invoice.amountOutstanding;
        summary.maxDaysOverdue = Math.max(summary.maxDaysOverdue, daysBetween(invoice.dueDate, this.now));
      }
    }
    for (const item of this.data.cases) {
      const summary = byCustomer.get(item.customerId);
      if (summary && item.status !== "closed") summary.openCases += 1;
    }
    return [...byCustomer.values()].sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);
  }

  getCustomerDetail(companyId: string, id: string): CustomerDetail | undefined {
    const summary = this.listCustomers(companyId).find((item) => item.id === id);
    if (!summary) return undefined;
    return {
      ...summary,
      invoices: this.invoicesOf(companyId).filter((item) => item.customerId === id).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
      cases: this.listCases(companyId, { customerId: id }),
      payments: this.data.payments.filter((item) => item.companyId === companyId && item.customerId === id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)),
      promises: this.data.promises.filter((item) => item.companyId === companyId && item.customerId === id),
    };
  }

  listApprovals(companyId: string, status = "awaiting_approval"): ApprovalItem[] {
    const invoices = this.indexById(this.invoicesOf(companyId));
    const customers = this.indexById(this.data.customers);
    return this.listActions(companyId)
      .filter((item) => (status === "decided" ? item.approvedBy !== undefined : item.status === status))
      .map((action) => {
        const invoice = invoices.get(action.invoiceId)!;
        return { ...action, customerName: customers.get(action.customerId)?.name ?? "Unknown customer", invoiceNumber: invoice.invoiceNumber, amountOutstanding: invoice.amountOutstanding, currency: invoice.currency };
      })
      .sort((a, b) => b.amountOutstanding - a.amountOutstanding);
  }

  listPromiseItems(companyId: string, status?: PromiseItem["status"]): PromiseItem[] {
    const invoices = this.indexById(this.invoicesOf(companyId));
    const customers = this.indexById(this.data.customers);
    const caseByInvoice = new Map(this.data.cases.map((item) => [item.invoiceId, item.id]));
    return this.listPromises(companyId)
      .filter((item) => !status || item.status === status)
      .map((promise) => {
        const invoice = invoices.get(promise.invoiceId)!;
        return { ...promise, customerName: customers.get(promise.customerId)?.name ?? "Unknown customer", invoiceNumber: invoice.invoiceNumber, amountOutstanding: invoice.amountOutstanding, collectionCaseId: caseByInvoice.get(promise.invoiceId) };
      })
      .sort((a, b) => a.promisedDate.localeCompare(b.promisedDate));
  }

  listPayments(companyId: string, matchStatus?: Payment["matchStatus"]): PaymentListItem[] {
    const invoices = this.indexById(this.invoicesOf(companyId));
    const customers = this.indexById(this.data.customers);
    return this.data.payments
      .filter((item) => item.companyId === companyId && (!matchStatus || item.matchStatus === matchStatus))
      .map((payment) => ({ ...payment, invoiceNumber: payment.invoiceId ? invoices.get(payment.invoiceId)?.invoiceNumber : undefined, customerName: payment.customerId ? customers.get(payment.customerId)?.name : undefined }))
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt));
  }

  paymentCandidates(companyId: string, paymentId: string): PaymentCandidate[] {
    const payment = this.data.payments.find((item) => item.companyId === companyId && item.id === paymentId);
    if (!payment) throw new Error("Payment not found");
    const customers = this.indexById(this.data.customers);
    const reference = payment.paymentReference.toLowerCase();
    return this.invoicesOf(companyId)
      .filter(OPEN_INVOICE)
      .map((invoice) => {
        const referenced = reference.includes(invoice.invoiceNumber.toLowerCase());
        const delta = Math.abs(invoice.amountOutstanding - payment.amount) / Math.max(payment.amount, 1);
        const score = (referenced ? 2 : 0) + (delta < 0.0001 ? 1.5 : delta < 0.05 ? 1 - delta * 10 : 0);
        const reason = referenced ? "Invoice number appears in payment reference" : delta < 0.0001 ? "Outstanding balance equals payment amount" : `Outstanding within ${(delta * 100).toFixed(1)}% of payment`;
        return { invoice, customerName: customers.get(invoice.customerId)?.name ?? "Unknown customer", reason, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ score: _score, ...candidate }) => candidate);
  }

  listAudit(companyId: string, filter: AuditFilter = {}): AuditEvent[] {
    return this.data.auditEvents
      .filter((item) => item.companyId === companyId && (!filter.entityId || item.entityId === filter.entityId) && (!filter.entityType || item.entityType === filter.entityType))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit ?? 100);
  }

  search(companyId: string, q: string): SearchResult[] {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const results: SearchResult[] = [];
    const caseByInvoice = new Map(this.data.cases.filter((item) => item.companyId === companyId).map((item) => [item.invoiceId, item.id]));
    const customers = this.indexById(this.data.customers);
    for (const invoice of this.invoicesOf(companyId)) {
      if (results.length >= 5) break;
      if (!invoice.invoiceNumber.toLowerCase().includes(needle)) continue;
      const caseId = caseByInvoice.get(invoice.id);
      results.push({ kind: caseId ? "case" : "invoice", id: invoice.id, href: caseId ? `/cases/${caseId}` : `/customers/${invoice.customerId}`, title: invoice.invoiceNumber, subtitle: `${customers.get(invoice.customerId)?.name ?? ""} · ${formatMoney(invoice.amountOutstanding, invoice.currency)} outstanding` });
    }
    for (const customer of this.data.customers) {
      if (results.length >= 10) break;
      if (customer.companyId !== companyId || !`${customer.name} ${customer.customerCode}`.toLowerCase().includes(needle)) continue;
      results.push({ kind: "customer", id: customer.id, href: `/customers/${customer.id}`, title: customer.name, subtitle: `${customer.customerCode} · ${customer.region ?? ""}` });
    }
    return results;
  }

  // ------------------------------------------------------------ mutations

  decideAction(companyId: string, actionId: string, decision: "approved" | "rejected", userId: string, note?: string): CollectionAction {
    const action = this.data.actions.find((item) => item.companyId === companyId && item.id === actionId);
    if (!action) throw new Error("Collection action not found");
    if (action.status !== "awaiting_approval") throw new Error("Only actions awaiting approval can be decided");
    action.status = decision;
    action.approvedBy = userId;
    const collectionCase = this.caseById(action.collectionCaseId);
    if (collectionCase) {
      collectionCase.nextAction = decision === "approved"
        ? action.actionType === "escalation" ? "Escalation approved: account manager to contact customer" : "Approved: queued for execution"
        : "Decision rejected: routine policy continues";
      collectionCase.updatedAt = new Date().toISOString();
    }
    this.audit(companyId, { type: "human", id: userId }, `action_${decision}`, "collection_action", action.id, note || `Human ${decision} ${action.actionType}`, { collectionCaseId: action.collectionCaseId, actionType: action.actionType, reason: action.reason });
    return action;
  }

  markActionExecuted(companyId: string, actionId: string, input: { subject: string; body: string; externalMessageId?: string }): CollectionAction {
    const action = this.data.actions.find((item) => item.companyId === companyId && item.id === actionId);
    if (!action) throw new Error("Collection action not found");
    if (!new Set(["pending", "approved"]).has(action.status)) throw new Error("Action is not ready for execution");
    action.status = "executed"; action.executedAt = new Date().toISOString(); action.message = input.body;
    const collectionCase = this.caseById(action.collectionCaseId);
    if (collectionCase && action.actionType === "reminder") {
      this.advance(companyId, collectionCase, ["reminder_pending", "reminder_sent"], SYSTEM, "Reminder delivered");
      collectionCase.nextAction = "Wait for customer response or next policy threshold";
    }
    this.data.communications.push({ id: randomUUID(), companyId, customerId: action.customerId, invoiceId: action.invoiceId, collectionCaseId: action.collectionCaseId, channel: "email", direction: "outbound", externalMessageId: input.externalMessageId, subject: input.subject, body: input.body, receivedAt: action.executedAt, processedAt: action.executedAt });
    this.audit(companyId, SYSTEM, "action_executed", "collection_action", action.id, `${action.actionType} executed via ${action.channel}`, { collectionCaseId: action.collectionCaseId, subject: input.subject, externalMessageId: input.externalMessageId });
    return action;
  }

  importInvoices(companyId: string, rows: InvoiceImportRow[], userId?: string): ImportResult {
    const result: ImportResult = { imported: 0, rejected: 0, reviewRequired: 0, errors: [] };
    rows.forEach((row, index) => {
      if (!row.invoice_number || !row.customer_name || !row.customer_email || !row.invoice_date || !row.due_date || !row.amount || !row.currency) {
        result.rejected += 1; result.errors.push({ row: index + 2, message: "Missing required invoice field" }); return;
      }
      if (row.due_date < row.invoice_date) {
        result.rejected += 1; result.errors.push({ row: index + 2, message: `Due date precedes invoice date for ${row.invoice_number}` }); return;
      }
      if (this.data.invoices.some((item) => item.companyId === companyId && item.invoiceNumber === row.invoice_number)) {
        result.rejected += 1; result.errors.push({ row: index + 2, message: `Duplicate invoice ${row.invoice_number}` }); return;
      }
      let customer = this.data.customers.find((item) => item.companyId === companyId && ((row.customer_code && item.customerCode === row.customer_code) || item.email.toLowerCase() === row.customer_email.toLowerCase()));
      if (!customer) {
        customer = {
          id: randomUUID(), companyId, customerCode: row.customer_code || `CUS-IMP-${this.data.customers.length + 1}`, name: row.customer_name,
          email: row.customer_email, phone: row.customer_phone, region: row.region, accountManager: row.account_manager, status: "active", createdAt: new Date().toISOString(),
        } satisfies Customer;
        this.data.customers.push(customer);
      }
      const amount = Number(row.amount);
      this.data.invoices.push({
        id: randomUUID(), companyId, customerId: customer.id, invoiceNumber: row.invoice_number, invoiceDate: row.invoice_date, dueDate: row.due_date,
        amount, currency: row.currency, amountPaid: 0, amountOutstanding: amount, status: new Date(row.due_date) < this.now ? "overdue" : "pending",
        source: "file_import", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      result.imported += 1;
    });
    this.audit(companyId, { type: "human", id: userId }, "invoices_imported", "import", randomUUID(), `${result.imported} invoices imported, ${result.rejected} rejected`, { ...result, errors: result.errors.slice(0, 20) });
    return result;
  }

  importPayments(companyId: string, rows: PaymentImportRow[]): ImportResult {
    const result: ImportResult = { imported: 0, rejected: 0, reviewRequired: 0, errors: [] };
    const customerCodes = new Map(this.data.customers.map((item) => [item.id, item.customerCode]));
    rows.forEach((row, index) => {
      if (!row.payment_reference || !row.amount || !row.payment_date) {
        result.rejected += 1; result.errors.push({ row: index + 2, message: "Missing required payment field" }); return;
      }
      if (this.data.payments.some((item) => item.companyId === companyId && item.paymentReference === row.payment_reference)) {
        result.rejected += 1; result.errors.push({ row: index + 2, message: `Duplicate payment reference ${row.payment_reference}` }); return;
      }
      const match = matchPayment({ invoiceNumber: row.invoice_number, paymentReference: row.payment_reference, customerCode: row.customer_code, amount: row.amount, paymentDate: row.payment_date }, this.invoicesOf(companyId), customerCodes);
      const payment: Payment = {
        id: randomUUID(), companyId, invoiceId: match.invoiceId, customerId: match.customerId, paymentReference: row.payment_reference,
        amount: Number(row.amount), paymentDate: row.payment_date, source: "file_import", matchStatus: match.status, matchNotes: match.notes, createdAt: new Date().toISOString(),
      };
      this.data.payments.push(payment);
      this.audit(companyId, SYSTEM, `payment_${match.status}`, "payment", payment.id, match.notes, { reference: payment.paymentReference, amount: payment.amount, candidates: match.candidates });
      if (match.status === "payment_match_review_required") result.reviewRequired += 1;
      if (match.status === "matched" && match.invoiceId) this.applyPayment(companyId, this.data.invoices.find((item) => item.id === match.invoiceId)!, payment, SYSTEM);
      result.imported += 1;
    });
    return result;
  }

  resolvePayment(companyId: string, paymentId: string, invoiceId: string, userId: string): Payment {
    const payment = this.data.payments.find((item) => item.companyId === companyId && item.id === paymentId);
    if (!payment) throw new Error("Payment not found");
    if (payment.matchStatus === "matched") throw new Error("Payment is already matched");
    const invoice = this.data.invoices.find((item) => item.companyId === companyId && item.id === invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    if (!OPEN_INVOICE(invoice)) throw new Error("Invoice has no outstanding balance");
    payment.invoiceId = invoice.id; payment.customerId = invoice.customerId; payment.matchStatus = "matched";
    payment.matchNotes = `Manually matched to ${invoice.invoiceNumber} by ${userId}`;
    this.audit(companyId, { type: "human", id: userId }, "payment_manually_matched", "payment", payment.id, `Reviewer matched ${payment.paymentReference} to ${invoice.invoiceNumber}`, { invoiceId: invoice.id, amount: payment.amount });
    this.applyPayment(companyId, invoice, payment, { type: "human", id: userId });
    return payment;
  }

  runDailyMonitor(companyId: string) {
    const policy = this.policy(companyId);
    const candidates = this.overdueInvoices(companyId);
    const created: CollectionAction[] = [];
    for (const invoice of candidates) {
      if (this.data.promises.some((item) => item.invoiceId === invoice.id && item.status === "active")) continue;
      const overdue = daysBetween(invoice.dueDate, this.now);
      let collectionCase = this.data.cases.find((item) => item.invoiceId === invoice.id);
      if (collectionCase?.status === "closed") continue;
      if (!collectionCase) {
        collectionCase = { id: randomUUID(), companyId, invoiceId: invoice.id, customerId: invoice.customerId, status: "overdue", priority: priorityFor(overdue, invoice.amountOutstanding), daysOverdue: overdue, nextAction: "Evaluate collection policy", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        this.data.cases.push(collectionCase);
        this.audit(companyId, AERA, "case_opened", "collection_case", collectionCase.id, `${invoice.invoiceNumber} is ${overdue} days overdue`, { invoiceNumber: invoice.invoiceNumber, amountOutstanding: invoice.amountOutstanding });
      }
      collectionCase.daysOverdue = overdue;
      collectionCase.priority = priorityFor(overdue, invoice.amountOutstanding);
      const step = applicablePolicyStep(invoice, policy, this.now);
      if (!step) continue;
      if (this.data.actions.some((action) => action.invoiceId === invoice.id && action.dataSnapshot.policyStepId === step.id)) continue;
      // One open human decision per case: a later escalation step must not stack on an undecided one.
      if (step.requiresHumanApproval && this.data.actions.some((action) => action.collectionCaseId === collectionCase!.id && action.status === "awaiting_approval")) continue;
      const action: CollectionAction = {
        id: randomUUID(), companyId, collectionCaseId: collectionCase.id, invoiceId: invoice.id, customerId: invoice.customerId,
        actionType: step.action, channel: step.action === "reminder" ? "email" : "internal",
        message: step.action === "reminder" ? `Send a ${step.tone} reminder for ${invoice.invoiceNumber}.` : `Review ${invoice.invoiceNumber}: ${overdue} days overdue, ${formatMoney(invoice.amountOutstanding, invoice.currency)} outstanding.`,
        reason: `Policy step "${step.id}" reached at ${overdue} days overdue`,
        dataSnapshot: { policyStepId: step.id, daysOverdue: overdue, amountOutstanding: invoice.amountOutstanding, tone: step.tone },
        scheduledAt: this.today(), status: step.requiresHumanApproval ? "awaiting_approval" : "pending", createdBy: "aera", createdAt: new Date().toISOString(),
      };
      this.data.actions.push(action); created.push(action);
      this.advance(companyId, collectionCase, [step.action === "reminder" ? "reminder_pending" : "escalated"], AERA, action.reason);
      collectionCase.nextAction = step.requiresHumanApproval ? "Human approval required" : "Generate and send reminder";
      this.audit(companyId, AERA, "action_created", "collection_action", action.id, action.reason, action.dataSnapshot);
    }
    this.audit(companyId, SYSTEM, "daily_monitor_run", "automation", "daily-monitor", `Reviewed ${candidates.length} overdue invoices; created ${created.length} actions`, { reviewed: candidates.length, created: created.length });
    return { reviewed: candidates.length, created: created.length, actions: created };
  }

  checkPromises(companyId: string) {
    const due = this.data.promises.filter((item) => item.companyId === companyId && item.status === "active" && item.promisedDate <= this.today());
    let fulfilled = 0; let missed = 0;
    for (const promise of due) {
      const invoice = this.data.invoices.find((item) => item.id === promise.invoiceId)!;
      const collectionCase = this.data.cases.find((item) => item.invoiceId === invoice.id);
      promise.updatedAt = new Date().toISOString();
      if (invoice.amountOutstanding <= 0) {
        promise.status = "fulfilled"; fulfilled += 1;
        if (collectionCase) this.closeCase(companyId, collectionCase, SYSTEM, "Promised payment verified");
      } else {
        promise.status = "missed"; missed += 1;
        this.audit(companyId, SYSTEM, "promise_missed", "payment_promise", promise.id, `No matched payment for ${invoice.invoiceNumber} by ${promise.promisedDate}`, { invoiceId: invoice.id, promisedDate: promise.promisedDate, amountOutstanding: invoice.amountOutstanding });
        if (collectionCase) {
          this.advance(companyId, collectionCase, ["promise_missed"], SYSTEM, "Promise date passed without a matched payment");
          collectionCase.nextAction = "Manager review required";
          this.requestApproval(companyId, collectionCase, invoice, `Missed promise of ${promise.promisedDate}`, { promiseId: promise.id });
        }
      }
    }
    this.audit(companyId, SYSTEM, "promise_check_run", "automation", "promise-monitor", `Checked ${due.length} due promises`, { checked: due.length, fulfilled, missed });
    return { checked: due.length, fulfilled, missed };
  }

  recordReply(companyId: string, input: { from: string; subject: string; body: string; externalMessageId: string }, classification: ReplyClassificationInput): ReplyResult {
    const existing = this.data.communications.find((item) => item.companyId === companyId && item.externalMessageId === input.externalMessageId);
    if (existing) {
      return { intent: classification.intent, caseId: existing.collectionCaseId, requiresHuman: false, confidence: classification.confidence, duplicate: true, outcome: "Message already processed; no changes made" };
    }
    const customer = this.data.customers.find((item) => item.companyId === companyId && item.email.toLowerCase() === input.from.toLowerCase());
    const text = `${input.subject}\n${input.body}`;
    const invoice = this.invoicesOf(companyId)
      .filter((item) => (!customer || item.customerId === customer.id) && text.includes(item.invoiceNumber))
      .sort((a, b) => b.invoiceNumber.length - a.invoiceNumber.length)[0];
    const collectionCase = invoice ? this.data.cases.find((item) => item.invoiceId === invoice.id) : undefined;
    const messageId = randomUUID();
    const at = new Date().toISOString();
    this.data.communications.push({ id: messageId, companyId, customerId: customer?.id, invoiceId: invoice?.id, collectionCaseId: collectionCase?.id, channel: "email", direction: "inbound", externalMessageId: input.externalMessageId, subject: input.subject, body: input.body, receivedAt: at, processedAt: at });

    const outcome = replyOutcome(classification, this.today());
    const result: ReplyResult = { intent: classification.intent, caseId: collectionCase?.id, requiresHuman: outcome.requestApproval, confidence: classification.confidence, duplicate: false, outcome: outcome.nextAction };
    if (!collectionCase || !invoice) {
      result.outcome = "No open case matched this reply; left for manual triage";
      this.audit(companyId, AERA, "reply_unmatched", "communication", messageId, result.outcome, { from: input.from, intent: classification.intent });
      return result;
    }

    this.advance(companyId, collectionCase, outcome.caseStatus === "customer_replied" ? ["customer_replied"] : ["customer_replied", outcome.caseStatus], AERA, outcome.reason);
    collectionCase.nextAction = outcome.nextAction;
    if (outcome.recordPromise && classification.promised_date) {
      for (const active of this.data.promises.filter((item) => item.invoiceId === invoice.id && item.status === "active")) { active.status = "cancelled"; active.updatedAt = at; }
      const promise = { id: randomUUID(), companyId, invoiceId: invoice.id, customerId: invoice.customerId, promisedAmount: classification.promised_amount ?? invoice.amountOutstanding, promisedDate: classification.promised_date, sourceMessageId: messageId, status: "active" as const, createdAt: at, updatedAt: at };
      this.data.promises.push(promise);
      collectionCase.nextActionAt = promise.promisedDate;
      result.promiseId = promise.id;
      this.audit(companyId, AERA, "promise_recorded", "collection_case", collectionCase.id, outcome.reason, { promiseId: promise.id, promisedDate: promise.promisedDate, promisedAmount: promise.promisedAmount, confidence: classification.confidence });
    }
    if (outcome.requestApproval) {
      result.approvalActionId = this.requestApproval(companyId, collectionCase, invoice, outcome.reason, { intent: classification.intent, sourceMessageId: messageId, confidence: classification.confidence }).id;
    }
    this.audit(companyId, AERA, "reply_processed", "collection_case", collectionCase.id, outcome.reason, { intent: classification.intent, confidence: classification.confidence, messageId });
    return result;
  }

  summary(companyId: string) {
    const overview = this.overview(companyId);
    const topCustomers = this.listCases(companyId, { statuses: OPEN_CASE_STATUSES }).slice(0, 5).map((item) => ({ customer: item.customer.name, invoice: item.invoice.invoiceNumber, outstanding: item.invoice.amountOutstanding, daysOverdue: item.daysOverdue }));
    return { generatedAt: new Date().toISOString(), businessDate: this.today(), overview, topCustomers, awaitingApproval: this.listActions(companyId, "awaiting_approval").length, paymentsInReview: this.listPayments(companyId, "payment_match_review_required").length, note: "Factual operational summary only; no financial decisions were made." };
  }

  // -------------------------------------------------------------- helpers

  private applyPayment(companyId: string, invoice: Invoice, payment: Payment, actor: Actor) {
    invoice.amountPaid = Math.min(invoice.amount, invoice.amountPaid + payment.amount);
    invoice.amountOutstanding = Math.max(0, invoice.amount - invoice.amountPaid);
    invoice.status = invoice.amountOutstanding === 0 ? "paid" : "partially_paid";
    invoice.updatedAt = new Date().toISOString();
    const collectionCase = this.data.cases.find((item) => item.invoiceId === invoice.id);
    if (invoice.amountOutstanding === 0) {
      for (const promise of this.data.promises.filter((item) => item.invoiceId === invoice.id && item.status === "active")) {
        promise.status = "fulfilled"; promise.updatedAt = invoice.updatedAt;
        this.audit(companyId, actor, "promise_fulfilled", "payment_promise", promise.id, `Matched payment ${payment.paymentReference} settled ${invoice.invoiceNumber}`, { paymentId: payment.id });
      }
      if (collectionCase) this.closeCase(companyId, collectionCase, actor, `Invoice settled by ${payment.paymentReference}`);
    } else if (collectionCase) {
      collectionCase.nextAction = `Partial payment received; ${formatMoney(invoice.amountOutstanding, invoice.currency)} still outstanding`;
      collectionCase.updatedAt = invoice.updatedAt;
      this.audit(companyId, actor, "partial_payment_applied", "collection_case", collectionCase.id, collectionCase.nextAction, { paymentId: payment.id, amount: payment.amount });
    }
  }

  private closeCase(companyId: string, collectionCase: CollectionCase, actor: Actor, reason: string) {
    // Every open status may close; payment_received is recorded on the way when the state machine allows it.
    this.advance(companyId, collectionCase, ["payment_received", "closed"], actor, reason);
    collectionCase.nextAction = "Nothing left to do: invoice settled";
    collectionCase.nextActionAt = undefined;
    for (const action of this.data.actions.filter((item) => item.collectionCaseId === collectionCase.id && (item.status === "pending" || item.status === "awaiting_approval"))) {
      action.status = "rejected";
      action.reason = `${action.reason} · withdrawn: case closed`;
    }
  }

  /** Walks the case through each status in order, skipping steps the state machine forbids. */
  private advance(companyId: string, collectionCase: CollectionCase, path: CaseStatus[], actor: Actor, reason: string) {
    for (const target of path) {
      if (collectionCase.status === target) continue;
      if (!canTransition(collectionCase.status, target)) continue;
      const from = collectionCase.status;
      collectionCase.status = target;
      collectionCase.updatedAt = new Date().toISOString();
      this.audit(companyId, actor, "case_status_changed", "collection_case", collectionCase.id, reason, { from, to: target });
    }
  }

  private requestApproval(companyId: string, collectionCase: CollectionCase, invoice: Invoice, reason: string, snapshot: Record<string, unknown>): CollectionAction {
    const existing = this.data.actions.find((item) => item.collectionCaseId === collectionCase.id && item.status === "awaiting_approval");
    if (existing) return existing;
    const action: CollectionAction = {
      id: randomUUID(), companyId, collectionCaseId: collectionCase.id, invoiceId: invoice.id, customerId: invoice.customerId, actionType: "escalation", channel: "internal",
      message: `Decide next step for ${invoice.invoiceNumber} (${formatMoney(invoice.amountOutstanding, invoice.currency)} outstanding).`, reason,
      dataSnapshot: { ...snapshot, amountOutstanding: invoice.amountOutstanding, daysOverdue: collectionCase.daysOverdue }, status: "awaiting_approval", createdBy: "aera", createdAt: new Date().toISOString(),
    };
    this.data.actions.push(action);
    this.audit(companyId, AERA, "approval_requested", "collection_action", action.id, reason, { collectionCaseId: collectionCase.id, ...snapshot });
    return action;
  }

  private audit(companyId: string, actor: Actor, eventType: string, entityType: AuditEvent["entityType"], entityId: string, reason: string, dataSnapshot: Record<string, unknown>) {
    this.data.auditEvents.push({ id: randomUUID(), companyId, actorType: actor.type, actorId: actor.id, eventType, entityType, entityId, reason, dataSnapshot, createdAt: new Date().toISOString() });
  }

  private invoicesOf(companyId: string) { return this.data.invoices.filter((item) => item.companyId === companyId); }
  private caseById(id: string) { return this.data.cases.find((item) => item.id === id); }
  private indexById<T extends { id: string }>(items: T[]) { return new Map(items.map((item) => [item.id, item])); }
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }

