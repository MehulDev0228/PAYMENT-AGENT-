import { randomUUID } from "node:crypto";
import { daysBetween, formatMoney, isoDate } from "@/lib/domain/money";
import { matchPayment } from "@/lib/domain/payment-matching";
import { applicablePolicyStep, priorityFor } from "@/lib/domain/policy";
import { replyOutcome, type ReplyClassificationInput } from "@/lib/domain/reply-outcome";
import { canTransition } from "@/lib/domain/state-machine";
import { OPEN_CASE_STATUSES } from "@/lib/domain/case-views";
import { inRegions, regionKey } from "@/lib/domain/regions";
import { ageingBucket, CALL_OUTCOMES, CALL_OUTCOME_LABELS } from "@/lib/domain/collector";
import type {
  AgeingReport, AgeingRow, ApprovalItem, AuditEvent, CaseDetail, CaseFilter, CaseFollowUp, CaseListItem, CaseStatus, CollectionAction, CollectionCase, CollectionOverview,
  Customer, CustomerDetail, CustomerSummary, DataSet, FollowUpDueItem, Invoice, Payment, PaymentListItem, PromiseItem, ReconciliationStatus, RegionSummary, SearchResult, WorkspaceUser,
} from "@/lib/domain/types";
import type { AuditReader, FieldChange, FollowUpInput, ImportResult, InvoiceImportRow, InvoiceSyncOptions, InvoiceSyncResult, InvoiceSyncRow, PaymentCandidate, PaymentImportRow, ReplyResult } from "./repository";

const PRIORITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 } as const;
const OPEN_INVOICE = (invoice: Invoice) => invoice.status !== "cancelled" && invoice.amountOutstanding > 0;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE_LENGTH = 2000;

type Actor = { type: AuditEvent["actorType"]; id?: string };
type CustomerContactField = "name" | "email" | "phone" | "region" | "accountManager";
/** An uploaded row once the optional columns have their defaults. */
type SyncRow = InvoiceImportRow & { invoice_date: string; currency: string; customer_name: string };
const KINDLYPAY: Actor = { type: "kindlypay" };
const SYSTEM: Actor = { type: "system" };

/**
 * All collection rules, applied synchronously to an in-memory DataSet.
 * Storage adapters load a company's data, run one engine call and persist what changed,
 * so the mock and the database share exactly the same behaviour.
 */
export class CollectionsEngine {
  constructor(readonly data: DataSet, private readonly now: Date) {}

  today() { return isoDate(this.now); }
  /** The same rules and business date over another working set (a region view of this one). */
  withData(data: DataSet) { return new CollectionsEngine(data, this.now); }
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
    const users = this.userNames(companyId);
    const lastFollowUps = this.lastFollowUps(companyId);
    const q = filter.q?.trim().toLowerCase();
    return this.data.cases
      .filter((item) => item.companyId === companyId)
      .filter((item) => !filter.statuses?.length || filter.statuses.includes(item.status))
      .filter((item) => !filter.priority || item.priority === filter.priority)
      .filter((item) => !filter.customerId || item.customerId === filter.customerId)
      .filter((item) => filter.assignedTo === undefined || (filter.assignedTo === null ? !item.assignedTo : item.assignedTo === filter.assignedTo))
      .map((item) => ({
        ...item, invoice: invoices.get(item.invoiceId)!, customer: customers.get(item.customerId)!, activePromise: activePromises.get(item.invoiceId),
        assigneeName: item.assignedTo ? users.get(item.assignedTo) : undefined, lastFollowUp: lastFollowUps.get(item.id),
      }))
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
    const users = this.userNames(companyId);
    return {
      ...item,
      actions: this.data.actions.filter((action) => action.collectionCaseId === id),
      communications: this.data.communications.filter((message) => message.collectionCaseId === id),
      promises: this.data.promises.filter((promise) => promise.invoiceId === item.invoiceId),
      payments: this.data.payments.filter((payment) => payment.invoiceId === item.invoiceId),
      followUps: this.data.followUps
        .filter((followUp) => followUp.collectionCaseId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((followUp) => ({ ...followUp, createdByName: users.get(followUp.createdBy) })),
    };
  }

  /** Workspace members who can own cases. */
  listUsers(companyId: string): WorkspaceUser[] {
    return this.data.users
      .filter((user) => user.companyId === companyId)
      .map(({ id, name, email, role }) => ({ id, name, email, role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Open cases whose latest follow-up planned a call for today or earlier, most overdue first. */
  followUpsDue(companyId: string): FollowUpDueItem[] {
    const today = this.today();
    return this.listCases(companyId)
      .filter((item) => item.status !== "closed" && item.lastFollowUp?.nextFollowUpDate !== undefined && item.lastFollowUp.nextFollowUpDate <= today)
      .map((item) => ({ followUp: item.lastFollowUp!, case: item, daysLate: daysBetween(item.lastFollowUp!.nextFollowUpDate!, this.now) }))
      .sort((a, b) => b.daysLate - a.daysLate || PRIORITY_RANK[b.case.priority] - PRIORITY_RANK[a.case.priority] || b.case.invoice.amountOutstanding - a.case.invoice.amountOutstanding);
  }

  /** Open balances per customer in 30-day bands past due, plus the invoice-level detail behind them. */
  ageingReport(companyId: string): AgeingReport {
    const customers = this.indexById(this.data.customers.filter((item) => item.companyId === companyId));
    const empty = () => ({ notDue: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0, openInvoices: 0 });
    const byCustomer = new Map<string, AgeingRow>();
    const totals = empty();
    const invoices: AgeingReport["invoices"] = [];
    for (const invoice of this.invoicesOf(companyId).filter(OPEN_INVOICE)) {
      const customer = customers.get(invoice.customerId);
      if (!customer) continue;
      const daysOverdue = new Date(invoice.dueDate) < this.now ? daysBetween(invoice.dueDate, this.now) : 0;
      const bucket = ageingBucket(daysOverdue);
      let row = byCustomer.get(customer.id);
      if (!row) {
        row = { customerId: customer.id, customerCode: customer.customerCode, customerName: customer.name, region: customer.region, accountManager: customer.accountManager, ...empty() };
        byCustomer.set(customer.id, row);
      }
      for (const target of [row, totals]) {
        target[bucket] += invoice.amountOutstanding; target.total += invoice.amountOutstanding; target.openInvoices += 1;
      }
      invoices.push({ invoice, customer, daysOverdue, bucket });
    }
    const overdue = (row: AgeingRow) => row.total - row.notDue;
    return {
      asOf: this.today(),
      rows: [...byCustomer.values()].sort((a, b) => overdue(b) - overdue(a) || b.total - a.total || a.customerName.localeCompare(b.customerName)),
      totals,
      invoices: invoices.sort((a, b) => b.daysOverdue - a.daysOverdue || b.invoice.amountOutstanding - a.invoice.amountOutstanding),
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

  listAudit(companyId: string, filter: Parameters<AuditReader>[1] = {}): AuditEvent[] {
    const entityIds = filter.entityIds && new Set(filter.entityIds);
    return this.data.auditEvents
      .filter((item) => item.companyId === companyId && (!filter.entityId || item.entityId === filter.entityId) && (!filter.entityType || item.entityType === filter.entityType))
      .filter((item) => !entityIds || entityIds.has(item.entityId))
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

  /** The distinct customer regions, spelled as first seen. */
  regions(companyId: string): string[] {
    const names = new Map<string, string>();
    for (const customer of this.data.customers) {
      const key = regionKey(customer.region);
      if (customer.companyId === companyId && key && !names.has(key)) names.set(key, customer.region!.trim());
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }

  /** One row per region, customers without a region last: the figures of a per-region receivables sheet. */
  regionSummary(companyId: string): RegionSummary[] {
    const horizon = new Date(this.now); horizon.setUTCDate(horizon.getUTCDate() + 7);
    const dueBy = isoDate(horizon);
    const keys: Array<string | null> = this.regions(companyId);
    if (this.data.customers.some((item) => item.companyId === companyId && !regionKey(item.region))) keys.push(null);
    return keys.map((region) => {
      const engine = this.withData(customerView(this.data, (customer) => (region === null ? !regionKey(customer.region) : inRegions(customer.region, [region]))).data);
      const invoices = engine.indexById(engine.invoicesOf(companyId));
      const due = engine.data.promises.filter((item) => item.companyId === companyId && item.status === "active" && item.promisedDate <= dueBy);
      return {
        ...engine.overview(companyId),
        region,
        customerCount: engine.data.customers.filter((item) => item.companyId === companyId).length,
        promisesDueCount: due.length,
        promisesDueAmount: sum(due.map((item) => item.promisedAmount ?? invoices.get(item.invoiceId)?.amountOutstanding ?? 0)),
      };
    });
  }

  /** Ids of every row in this working set that an audit event can point at. */
  entityIds(): string[] {
    const { invoices, payments, cases, actions, promises, communications } = this.data;
    return [invoices, payments, cases, actions, promises, communications].flatMap((items: Array<{ id: string }>) => items.map((item) => item.id));
  }

  // ------------------------------------------------------------ mutations

  /** Gives a case to a workspace user (null = unassigned). An unchanged assignment is not re-audited. */
  assignCase(companyId: string, caseId: string, assigneeId: string | null, actorId: string): CollectionCase {
    const collectionCase = this.data.cases.find((item) => item.companyId === companyId && item.id === caseId);
    if (!collectionCase) throw new Error("Collection case not found");
    const users = this.userNames(companyId);
    if (assigneeId !== null && !users.has(assigneeId)) throw new Error("Assignee is not a user in this workspace");
    const from = collectionCase.assignedTo ?? null;
    if (from === assigneeId) return collectionCase;
    collectionCase.assignedTo = assigneeId ?? undefined;
    collectionCase.updatedAt = new Date().toISOString();
    const fromName = from ? users.get(from) ?? from : null;
    const toName = assigneeId ? users.get(assigneeId)! : null;
    const reason = toName ? `Assigned to ${toName}${fromName ? ` (was ${fromName})` : ""}` : `Unassigned (was ${fromName})`;
    this.audit(companyId, { type: "human", id: actorId }, toName ? "case_assigned" : "case_unassigned", "collection_case", collectionCase.id, reason, { from, to: assigneeId, fromName, toName });
    return collectionCase;
  }

  /** Records a call or note on a case and, optionally, when to follow up next. */
  logFollowUp(companyId: string, caseId: string, input: FollowUpInput, actorId: string): CaseFollowUp {
    const collectionCase = this.data.cases.find((item) => item.companyId === companyId && item.id === caseId);
    if (!collectionCase) throw new Error("Collection case not found");
    if (!CALL_OUTCOMES.includes(input.outcome)) throw new Error("Unknown call outcome");
    const note = (input.note ?? "").trim();
    if (note.length > MAX_NOTE_LENGTH) throw new Error(`Notes are limited to ${MAX_NOTE_LENGTH} characters`);
    const next = input.nextFollowUpDate || undefined;
    if (next !== undefined) {
      if (!ISO_DATE.test(next) || isoDate(new Date(`${next}T00:00:00Z`)) !== next) throw new Error("Next follow-up date must be a valid YYYY-MM-DD date");
      if (next < this.today()) throw new Error("Next follow-up date cannot be in the past");
    }
    const followUp: CaseFollowUp = {
      id: randomUUID(), companyId, collectionCaseId: collectionCase.id, customerId: collectionCase.customerId, outcome: input.outcome, note,
      ...(next ? { nextFollowUpDate: next } : {}), createdBy: actorId, createdAt: new Date().toISOString(),
    };
    this.data.followUps.push(followUp);
    collectionCase.updatedAt = followUp.createdAt;
    const reason = `${CALL_OUTCOME_LABELS[input.outcome]}${next ? ` · next follow-up ${next}` : ""}${note ? ` · ${note.length > 140 ? `${note.slice(0, 139)}…` : note}` : ""}`;
    this.audit(companyId, { type: "human", id: actorId }, "follow_up_logged", "collection_case", collectionCase.id, reason, { followUpId: followUp.id, outcome: input.outcome, nextFollowUpDate: next ?? null, note });
    return followUp;
  }

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

  /**
   * Daily ledger sync. New invoice numbers are created; known ones take the file's amount, due date and
   * customer contact details. KindlyPay's own payment record is never overwritten: an ERP balance that differs,
   * an amount below what is already paid, or (in full-ledger mode) an open invoice the file no longer lists
   * is flagged for reconciliation instead. Every change is audited with before and after values.
   * `options.regions` limits the sync to customers in those regions: other rows are rejected, and full-ledger
   * mode only flags missing invoices inside those regions.
   */
  importInvoices(companyId: string, rows: InvoiceImportRow[], userId?: string, options: InvoiceSyncOptions = {}): InvoiceSyncResult {
    const actor: Actor = { type: "human", id: userId };
    const importId = randomUUID();
    const counts: InvoiceSyncResult["counts"] = { new: 0, updated: 0, unchanged: 0, flagged: 0, rejected: 0 };
    const report: InvoiceSyncRow[] = [];
    const record = (entry: InvoiceSyncRow) => { counts[entry.outcome] += 1; if (entry.outcome !== "unchanged") report.push(entry); };
    const byNumber = new Map(this.invoicesOf(companyId).map((item) => [item.invoiceNumber, item]));
    const inFile = new Set<string>();
    const seen = new Set<string>();

    for (const invalid of options.invalidRows ?? []) {
      if (invalid.invoiceNumber) inFile.add(invalid.invoiceNumber);
      record({ row: invalid.row, invoiceNumber: invalid.invoiceNumber ?? "", outcome: "rejected", changes: [], message: invalid.message });
    }
    rows.forEach((input, index) => {
      const rowNumber = input.row ?? index + 2;
      if (input.invoice_number) inFile.add(input.invoice_number);
      const reject = (message: string) => record({ row: rowNumber, invoiceNumber: input.invoice_number ?? "", outcome: "rejected", changes: [], message });
      if (!input.invoice_number || !input.customer_email || !input.due_date || !input.amount) return reject("Needs a bill number, customer email, amount due and due date");
      // Only the four columns above are required; the rest fall back to sensible defaults.
      const row: SyncRow = {
        ...input,
        invoice_date: input.invoice_date || input.due_date,
        currency: input.currency || this.data.companies.find((item) => item.id === companyId)?.currency || "INR",
        customer_name: input.customer_name || nameFromEmail(input.customer_email),
      };
      if (row.due_date < row.invoice_date) return reject(`Due date precedes invoice date for ${row.invoice_number}`);
      if (seen.has(row.invoice_number)) return reject(`${row.invoice_number} appears more than once in this file`);
      seen.add(row.invoice_number);
      if (options.regions) {
        const known = byNumber.get(row.invoice_number);
        const owner = known ? this.data.customers.find((item) => item.id === known.customerId) : this.findImportCustomer(companyId, row);
        const region = (owner ? owner.region : row.region)?.trim();
        if (!inRegions(region, options.regions)) return reject(`${row.invoice_number} belongs to ${region ? `region ${region}` : "no region"}, outside your regions`);
        const moveTo = row.region?.trim();
        if (moveTo && !inRegions(moveTo, options.regions)) return reject(`${row.invoice_number} would move its customer to region ${moveTo}, outside your regions`);
      }
      const amount = round2(Number(row.amount));
      const outstanding = row.outstanding === undefined ? undefined : round2(Number(row.outstanding));
      if (outstanding !== undefined && !(outstanding >= 0 && outstanding <= amount)) return reject(`Outstanding ${outstanding} for ${row.invoice_number} must be between 0 and the invoice amount`);
      const existing = byNumber.get(row.invoice_number);
      const outcome = existing
        ? this.syncInvoice(companyId, existing, row, amount, outstanding, actor, importId)
        : this.createInvoice(companyId, row, amount, outstanding, actor, importId);
      if (typeof outcome === "string") return reject(outcome);
      record({ row: rowNumber, ...outcome });
    });

    if (options.fullLedger) {
      for (const invoice of this.invoicesOf(companyId)) {
        if (inFile.has(invoice.invoiceNumber) || !OPEN_INVOICE(invoice)) continue;
        // A regional user's file is their regions' ledger: it says nothing about invoices elsewhere.
        if (options.regions && !inRegions(this.data.customers.find((item) => item.id === invoice.customerId)?.region, options.regions)) continue;
        const changes: FieldChange[] = [];
        if (invoice.reconciliationStatus !== "missing_from_ledger") {
          changes.push({ field: "reconciliationStatus", before: invoice.reconciliationStatus ?? null, after: "missing_from_ledger" });
          invoice.reconciliationStatus = "missing_from_ledger";
          invoice.reconciliationNote = `Not in the ledger imported on ${this.today()}; likely paid or cancelled in the ERP. Reminders are paused until it is reconciled.`;
          invoice.updatedAt = new Date().toISOString();
          this.audit(companyId, actor, "invoice_missing_from_ledger", "invoice", invoice.id, invoice.reconciliationNote, { importId, invoiceNumber: invoice.invoiceNumber, amountOutstanding: invoice.amountOutstanding, changes });
        }
        record({ invoiceNumber: invoice.invoiceNumber, outcome: "flagged", changes, reconciliation: "missing_from_ledger", message: "Open in KindlyPay but missing from the ledger: likely paid or cancelled in the ERP" });
      }
    }

    report.sort((a, b) => (a.row ?? Number.MAX_SAFE_INTEGER) - (b.row ?? Number.MAX_SAFE_INTEGER));
    const errors = report.filter((item) => item.outcome === "rejected").map((item) => ({ row: item.row ?? 0, message: item.message ?? "Rejected" }));
    const result: InvoiceSyncResult = { imported: counts.new + counts.updated, rejected: counts.rejected, reviewRequired: counts.flagged, errors, dryRun: false, fullLedger: Boolean(options.fullLedger), counts, rows: report };
    this.audit(companyId, actor, "invoices_imported", "import", importId,
      `Ledger sync: ${counts.new} new, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.flagged} flagged, ${counts.rejected} rejected`,
      { counts, fullLedger: result.fullLedger, errors: errors.slice(0, 20) });
    return result;
  }

  /** The ledger sync on a throwaway copy of the data: exactly what importInvoices would do, with nothing saved. */
  previewInvoices(companyId: string, rows: InvoiceImportRow[], userId?: string, options: InvoiceSyncOptions = {}): InvoiceSyncResult {
    const result = new CollectionsEngine(structuredClone(this.data), this.now).importInvoices(companyId, rows, userId, options);
    return { ...result, dryRun: true };
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
      // The ERP no longer lists it as open: never chase a customer for what may already be paid or cancelled.
      if (invoice.reconciliationStatus === "missing_from_ledger") continue;
      const overdue = daysBetween(invoice.dueDate, this.now);
      let collectionCase = this.data.cases.find((item) => item.invoiceId === invoice.id);
      if (collectionCase?.status === "closed") continue;
      if (!collectionCase) {
        collectionCase = { id: randomUUID(), companyId, invoiceId: invoice.id, customerId: invoice.customerId, status: "overdue", priority: priorityFor(overdue, invoice.amountOutstanding), daysOverdue: overdue, nextAction: "Evaluate collection policy", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        this.data.cases.push(collectionCase);
        this.audit(companyId, KINDLYPAY, "case_opened", "collection_case", collectionCase.id, `${invoice.invoiceNumber} is ${overdue} days overdue`, { invoiceNumber: invoice.invoiceNumber, amountOutstanding: invoice.amountOutstanding });
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
        scheduledAt: this.today(), status: step.requiresHumanApproval ? "awaiting_approval" : "pending", createdBy: "kindlypay", createdAt: new Date().toISOString(),
      };
      this.data.actions.push(action); created.push(action);
      this.advance(companyId, collectionCase, [step.action === "reminder" ? "reminder_pending" : "escalated"], KINDLYPAY, action.reason);
      collectionCase.nextAction = step.requiresHumanApproval ? "Human approval required" : "Generate and send reminder";
      this.audit(companyId, KINDLYPAY, "action_created", "collection_action", action.id, action.reason, action.dataSnapshot);
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
      this.audit(companyId, KINDLYPAY, "reply_unmatched", "communication", messageId, result.outcome, { from: input.from, intent: classification.intent });
      return result;
    }

    this.advance(companyId, collectionCase, outcome.caseStatus === "customer_replied" ? ["customer_replied"] : ["customer_replied", outcome.caseStatus], KINDLYPAY, outcome.reason);
    collectionCase.nextAction = outcome.nextAction;
    if (outcome.recordPromise && classification.promised_date) {
      for (const active of this.data.promises.filter((item) => item.invoiceId === invoice.id && item.status === "active")) { active.status = "cancelled"; active.updatedAt = at; }
      const promise = { id: randomUUID(), companyId, invoiceId: invoice.id, customerId: invoice.customerId, promisedAmount: classification.promised_amount ?? invoice.amountOutstanding, promisedDate: classification.promised_date, sourceMessageId: messageId, status: "active" as const, createdAt: at, updatedAt: at };
      this.data.promises.push(promise);
      collectionCase.nextActionAt = promise.promisedDate;
      result.promiseId = promise.id;
      this.audit(companyId, KINDLYPAY, "promise_recorded", "collection_case", collectionCase.id, outcome.reason, { promiseId: promise.id, promisedDate: promise.promisedDate, promisedAmount: promise.promisedAmount, confidence: classification.confidence });
    }
    if (outcome.requestApproval) {
      result.approvalActionId = this.requestApproval(companyId, collectionCase, invoice, outcome.reason, { intent: classification.intent, sourceMessageId: messageId, confidence: classification.confidence }).id;
    }
    this.audit(companyId, KINDLYPAY, "reply_processed", "collection_case", collectionCase.id, outcome.reason, { intent: classification.intent, confidence: classification.confidence, messageId });
    return result;
  }

  summary(companyId: string) {
    const overview = this.overview(companyId);
    const topCustomers = this.listCases(companyId, { statuses: OPEN_CASE_STATUSES }).slice(0, 5).map((item) => ({ customer: item.customer.name, invoice: item.invoice.invoiceNumber, outstanding: item.invoice.amountOutstanding, daysOverdue: item.daysOverdue }));
    return { generatedAt: new Date().toISOString(), businessDate: this.today(), overview, topCustomers, awaitingApproval: this.listActions(companyId, "awaiting_approval").length, paymentsInReview: this.listPayments(companyId, "payment_match_review_required").length, note: "Factual operational summary only; no financial decisions were made." };
  }

  // ---------------------------------------------------- ledger sync helpers

  private createInvoice(companyId: string, row: SyncRow, amount: number, outstanding: number | undefined, actor: Actor, importId: string): Omit<InvoiceSyncRow, "row"> | string {
    let customer = this.findImportCustomer(companyId, row);
    let changes: FieldChange[] = [];
    if (customer) {
      const update = this.customerUpdate(companyId, customer, row);
      if (typeof update === "string") return update;
      changes = this.applyCustomerUpdate(companyId, customer, update, row.invoice_number, actor, importId);
    } else {
      customer = {
        id: randomUUID(), companyId, customerCode: row.customer_code || `CUS-IMP-${this.data.customers.length + 1}`, name: row.customer_name,
        email: row.customer_email, phone: row.customer_phone, region: row.region, accountManager: row.account_manager, status: "active", createdAt: new Date().toISOString(),
      } satisfies Customer;
      this.data.customers.push(customer);
    }
    // A first sync takes the ERP balance as the opening position: whatever is already settled there was paid before KindlyPay.
    const amountOutstanding = outstanding ?? amount;
    const at = new Date().toISOString();
    const invoice: Invoice = {
      id: randomUUID(), companyId, customerId: customer.id, invoiceNumber: row.invoice_number, invoiceDate: row.invoice_date, dueDate: row.due_date,
      amount, currency: row.currency, amountPaid: round2(amount - amountOutstanding), amountOutstanding, status: "pending",
      source: "file_import", createdAt: at, updatedAt: at,
    };
    invoice.status = this.derivedStatus(invoice);
    this.data.invoices.push(invoice);
    const message = invoice.amountPaid > 0 ? `Opening balance ${formatMoney(amountOutstanding, invoice.currency)}; ${formatMoney(invoice.amountPaid, invoice.currency)} already settled in the ERP` : undefined;
    this.audit(companyId, actor, "invoice_imported", "invoice", invoice.id, message ?? `${invoice.invoiceNumber} imported from the ledger`,
      { importId, invoiceNumber: invoice.invoiceNumber, amount, amountPaid: invoice.amountPaid, amountOutstanding, dueDate: invoice.dueDate });
    return { invoiceNumber: invoice.invoiceNumber, outcome: "new", changes, ...(message ? { message } : {}) };
  }

  private syncInvoice(companyId: string, invoice: Invoice, row: SyncRow, amount: number, outstanding: number | undefined, actor: Actor, importId: string): Omit<InvoiceSyncRow, "row"> | string {
    if (invoice.status === "cancelled") return `${invoice.invoiceNumber} is cancelled in KindlyPay`;
    if (row.currency !== invoice.currency) return `${invoice.invoiceNumber} is in ${invoice.currency} in KindlyPay, not ${row.currency}`;
    const customer = this.data.customers.find((item) => item.id === invoice.customerId)!;
    if (row.customer_code && row.customer_code !== customer.customerCode) return `${invoice.invoiceNumber} belongs to customer ${customer.customerCode}, not ${row.customer_code}`;
    const customerChanges = this.customerUpdate(companyId, customer, row);
    if (typeof customerChanges === "string") return customerChanges;

    const changes: FieldChange[] = [];
    const target = invoice as unknown as Record<string, unknown>;
    const set = <K extends keyof Invoice>(field: K, after: Invoice[K] | undefined) => {
      const before = invoice[field];
      if (before === after) return;
      changes.push({ field, before: (before ?? null) as FieldChange["before"], after: (after ?? null) as FieldChange["after"] });
      if (after === undefined) delete target[field]; else target[field] = after;
    };
    const money = (value: number) => formatMoney(value, invoice.currency);
    const wasOpen = invoice.amountOutstanding > 0;
    let flag: ReconciliationStatus | undefined;
    let note: string | undefined;

    set("dueDate", row.due_date);
    if (amount !== invoice.amount) {
      // Payments KindlyPay matched stay applied: an amount below them is a question for a person, not an overwrite.
      const paid = Math.max(invoice.amountPaid, this.matchedPaid(invoice));
      if (amount < paid) {
        flag = "amount_below_paid";
        note = `ERP amount ${money(amount)} is below the ${money(paid)} KindlyPay has recorded as paid; the amount stays at ${money(invoice.amount)}`;
      } else {
        set("amount", amount); set("amountPaid", paid); set("amountOutstanding", round2(amount - paid));
      }
    }
    if (changes.length) set("status", this.derivedStatus(invoice));

    if (!flag && outstanding !== undefined) {
      const difference = round2(outstanding - invoice.amountOutstanding);
      if (difference !== 0) {
        flag = "balance_mismatch";
        note = `ERP balance ${money(outstanding)} vs ${money(invoice.amountOutstanding)} in KindlyPay (ERP ${difference > 0 ? "higher" : "lower"} by ${money(Math.abs(difference))})`;
      }
    } else if (!flag && invoice.reconciliationStatus === "balance_mismatch") {
      // This file carries no balance column, so an earlier mismatch is still unresolved.
      flag = "balance_mismatch"; note = invoice.reconciliationNote;
    }
    // The ERP figure is kept only while it is in question; an agreeing balance needs no second copy.
    set("erpOutstanding", flag === "balance_mismatch" ? outstanding ?? invoice.erpOutstanding : undefined);
    set("reconciliationStatus", flag);
    if (note) invoice.reconciliationNote = note; else delete invoice.reconciliationNote;

    let message = note;
    if (changes.length) {
      invoice.updatedAt = new Date().toISOString();
      this.audit(companyId, actor, "invoice_synced", "invoice", invoice.id, `Ledger sync changed ${changes.map((item) => item.field).join(", ")}`,
        { importId, invoiceNumber: invoice.invoiceNumber, changes, ...(note ? { reconciliationNote: note } : {}) });
      if (wasOpen && invoice.amountOutstanding === 0) this.settleInvoice(companyId, invoice, actor, `Ledger amount for ${invoice.invoiceNumber} now equals the amount paid`, { importId });
      if (!wasOpen && invoice.amountOutstanding > 0) message ??= `Balance reopened at ${money(invoice.amountOutstanding)}; a closed case stays closed`;
    }
    const applied = this.applyCustomerUpdate(companyId, customer, customerChanges, invoice.invoiceNumber, actor, importId);
    const outcome = flag ? "flagged" : changes.length || applied.length ? "updated" : "unchanged";
    return { invoiceNumber: invoice.invoiceNumber, outcome, changes: [...changes, ...applied], ...(flag ? { reconciliation: flag } : {}), ...(message ? { message } : {}) };
  }

  /** The customer an imported row belongs to: by customer code first, then by email. */
  private findImportCustomer(companyId: string, row: SyncRow) {
    const customers = this.data.customers.filter((item) => item.companyId === companyId);
    return (row.customer_code ? customers.find((item) => item.customerCode === row.customer_code) : undefined)
      ?? customers.find((item) => item.email.toLowerCase() === row.customer_email.toLowerCase());
  }

  /** Contact fields the row would change on the customer (blank cells keep the current value), or why it cannot. */
  private customerUpdate(companyId: string, customer: Customer, row: SyncRow): FieldChange[] | string {
    const email = row.customer_email.trim();
    const sameEmail = email.toLowerCase() === customer.email.toLowerCase();
    if (!sameEmail) {
      const owner = this.data.customers.find((item) => item.companyId === companyId && item.id !== customer.id && item.email.toLowerCase() === email.toLowerCase());
      if (owner) return `Email ${email} already belongs to customer ${owner.customerCode}`;
    }
    const next: Array<[CustomerContactField, string | undefined]> = [
      ["name", row.customer_name], ["email", sameEmail ? undefined : email], ["phone", row.customer_phone], ["region", row.region], ["accountManager", row.account_manager],
    ];
    return next
      .filter(([field, value]) => value && value !== customer[field])
      .map(([field, value]) => ({ field: `customer.${field}`, before: customer[field] ?? null, after: value! }));
  }

  private applyCustomerUpdate(companyId: string, customer: Customer, changes: FieldChange[], invoiceNumber: string, actor: Actor, importId: string): FieldChange[] {
    if (!changes.length) return changes;
    for (const change of changes) customer[change.field.slice("customer.".length) as CustomerContactField] = String(change.after);
    this.audit(companyId, actor, "customer_updated", "customer", customer.id, `Ledger sync changed ${changes.map((item) => item.field.slice("customer.".length)).join(", ")} via ${invoiceNumber}`,
      { importId, invoiceNumber, changes });
    return changes;
  }

  private matchedPaid(invoice: Invoice) {
    return round2(sum(this.data.payments.filter((item) => item.invoiceId === invoice.id && item.matchStatus === "matched").map((item) => item.amount)));
  }

  private derivedStatus(invoice: Invoice): Invoice["status"] {
    if (invoice.status === "cancelled") return "cancelled";
    if (invoice.amountOutstanding <= 0) return "paid";
    if (invoice.amountPaid > 0) return "partially_paid";
    return new Date(invoice.dueDate) < this.now ? "overdue" : "pending";
  }

  // -------------------------------------------------------------- helpers

  private applyPayment(companyId: string, invoice: Invoice, payment: Payment, actor: Actor) {
    invoice.amountPaid = Math.min(invoice.amount, invoice.amountPaid + payment.amount);
    invoice.amountOutstanding = Math.max(0, invoice.amount - invoice.amountPaid);
    invoice.status = invoice.amountOutstanding === 0 ? "paid" : "partially_paid";
    invoice.updatedAt = new Date().toISOString();
    const collectionCase = this.data.cases.find((item) => item.invoiceId === invoice.id);
    if (invoice.amountOutstanding === 0) {
      this.settleInvoice(companyId, invoice, actor, `Matched payment ${payment.paymentReference} settled ${invoice.invoiceNumber}`, { paymentId: payment.id });
    } else if (collectionCase) {
      collectionCase.nextAction = `Partial payment received; ${formatMoney(invoice.amountOutstanding, invoice.currency)} still outstanding`;
      collectionCase.updatedAt = invoice.updatedAt;
      this.audit(companyId, actor, "partial_payment_applied", "collection_case", collectionCase.id, collectionCase.nextAction, { paymentId: payment.id, amount: payment.amount });
    }
  }

  /** Fulfils open promises and closes the case of an invoice that has nothing left outstanding. */
  private settleInvoice(companyId: string, invoice: Invoice, actor: Actor, reason: string, snapshot: Record<string, unknown>) {
    for (const promise of this.data.promises.filter((item) => item.invoiceId === invoice.id && item.status === "active")) {
      promise.status = "fulfilled"; promise.updatedAt = invoice.updatedAt;
      this.audit(companyId, actor, "promise_fulfilled", "payment_promise", promise.id, reason, snapshot);
    }
    // Being settled in KindlyPay explains why the ERP's open ledger no longer lists it.
    if (invoice.reconciliationStatus === "missing_from_ledger") {
      delete invoice.reconciliationStatus; delete invoice.reconciliationNote;
      this.audit(companyId, actor, "invoice_reconciled", "invoice", invoice.id, `${invoice.invoiceNumber} is settled, which explains its absence from the ledger`,
        { ...snapshot, changes: [{ field: "reconciliationStatus", before: "missing_from_ledger", after: null }] });
    }
    const collectionCase = this.data.cases.find((item) => item.invoiceId === invoice.id);
    if (collectionCase) this.closeCase(companyId, collectionCase, actor, reason);
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
      dataSnapshot: { ...snapshot, amountOutstanding: invoice.amountOutstanding, daysOverdue: collectionCase.daysOverdue }, status: "awaiting_approval", createdBy: "kindlypay", createdAt: new Date().toISOString(),
    };
    this.data.actions.push(action);
    this.audit(companyId, KINDLYPAY, "approval_requested", "collection_action", action.id, reason, { collectionCaseId: collectionCase.id, ...snapshot });
    return action;
  }

  private audit(companyId: string, actor: Actor, eventType: string, entityType: AuditEvent["entityType"], entityId: string, reason: string, dataSnapshot: Record<string, unknown>) {
    this.data.auditEvents.push({ id: randomUUID(), companyId, actorType: actor.type, actorId: actor.id, eventType, entityType, entityId, reason, dataSnapshot, createdAt: new Date().toISOString() });
  }

  private userNames(companyId: string) {
    return new Map(this.data.users.filter((user) => user.companyId === companyId).map((user) => [user.id, user.name]));
  }

  private lastFollowUps(companyId: string) {
    const latest = new Map<string, CaseFollowUp>();
    for (const followUp of this.data.followUps) {
      if (followUp.companyId !== companyId) continue;
      const current = latest.get(followUp.collectionCaseId);
      if (!current || followUp.createdAt >= current.createdAt) latest.set(followUp.collectionCaseId, followUp);
    }
    return latest;
  }

  private invoicesOf(companyId: string) { return this.data.invoices.filter((item) => item.companyId === companyId); }
  private caseById(id: string) { return this.data.cases.find((item) => item.id === id); }
  private indexById<T extends { id: string }>(items: T[]) { return new Map(items.map((item) => [item.id, item])); }
}

/** "accounts@bluebird-foods.co.in" → "Bluebird Foods", for bills uploaded without a customer name. */
function nameFromEmail(email: string): string {
  const label = email.split("@")[1]?.split(".")[0] ?? email;
  return label.split(/[-_]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || email;
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function round2(value: number) { return Math.round(value * 100) / 100; }

const VIEW_KEYS = ["customers", "invoices", "payments", "cases", "actions", "promises", "communications", "followUps"] as const;

/**
 * The part of a working set that belongs to the customers `visible` accepts: those customers and their
 * invoices, payments, cases, actions, promises and messages. Rows are shared with `data`, so the engine's
 * changes to them land in `data`; `commit()` copies rows the engine added to the view into `data` too.
 * Payments and messages that belong to no customer belong to no region, so a view leaves them out.
 */
export function customerView(data: DataSet, visible: (customer: Customer) => boolean): { data: DataSet; commit(): void } {
  const customers = data.customers.filter(visible);
  const ids = new Set(customers.map((item) => item.id));
  const owned = <T extends { customerId?: string }>(items: T[]) => items.filter((item) => item.customerId !== undefined && ids.has(item.customerId));
  const view: DataSet = {
    ...data, customers, invoices: owned(data.invoices), payments: owned(data.payments), cases: owned(data.cases),
    actions: owned(data.actions), promises: owned(data.promises), communications: owned(data.communications), followUps: owned(data.followUps),
  };
  return {
    data: view,
    commit() {
      for (const key of VIEW_KEYS) {
        const known = new Set<object>(data[key]);
        for (const item of view[key] as object[]) if (!known.has(item)) (data[key] as object[]).push(item);
      }
    },
  };
}

