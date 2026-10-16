import { formatMoney } from "@/lib/domain/money";
import { OPEN_CASE_STATUSES } from "@/lib/domain/case-views";
import type { AeraRepository } from "@/lib/data/repository";

export interface QueryTable {
  columns: string[];
  rows: Array<Array<string | number>>;
}

export interface QueryAnswer {
  answer: string;
  tool: string;
  data: unknown;
  table?: QueryTable;
}

/**
 * Read-only question router. Each branch calls exactly one structured tool and
 * phrases the result; numbers always come from the repository, never from a model.
 */
export async function answerCollectionQuery(repository: AeraRepository, companyId: string, question: string): Promise<QueryAnswer> {
  const lower = question.toLowerCase();
  const overview = await repository.overview(companyId);

  if (/(more than 30|30\+|over 30|older than 30)/.test(lower)) {
    const bucket = overview.aging.find((item) => item.label === "30+ days")!;
    return { answer: `${formatMoney(bucket.amount)} is overdue by more than 30 days across ${bucket.count} invoices.`, tool: "get_aging_bucket", data: bucket, table: agingTable(overview.aging) };
  }
  if (/aging|ageing|bucket/.test(lower)) {
    return { answer: `Outstanding receivables total ${formatMoney(overview.totalOutstanding)}. The breakdown by age is below.`, tool: "get_aging_summary", data: overview.aging, table: agingTable(overview.aging) };
  }
  if (lower.includes("promise") && /(miss|broke|broken)/.test(lower)) {
    const missed = await repository.listPromiseItems(companyId, "missed");
    return { answer: `${missed.length} payment promises are marked missed, covering ${formatMoney(missed.reduce((s, p) => s + p.amountOutstanding, 0))} still outstanding.`, tool: "get_missed_promises", data: missed.slice(0, 20), table: { columns: ["Customer", "Invoice", "Promised", "Outstanding"], rows: missed.slice(0, 10).map((p) => [p.customerName, p.invoiceNumber, p.promisedDate, formatMoney(p.amountOutstanding)]) } };
  }
  if (lower.includes("promise")) {
    const active = await repository.listPromiseItems(companyId, "active");
    return { answer: `${active.length} payment promises are active. The earliest is due ${active[0]?.promisedDate ?? "—"}.`, tool: "get_active_promises", data: active.slice(0, 20), table: { columns: ["Customer", "Invoice", "Promised", "Amount"], rows: active.slice(0, 10).map((p) => [p.customerName, p.invoiceNumber, p.promisedDate, formatMoney(p.promisedAmount ?? p.amountOutstanding)]) } };
  }
  if (/(approval|approve|waiting|decision)/.test(lower)) {
    const approvals = await repository.listApprovals(companyId);
    return { answer: `${approvals.length} decisions are waiting for a human, covering ${formatMoney(approvals.reduce((s, a) => s + a.amountOutstanding, 0))} outstanding.`, tool: "get_pending_approvals", data: approvals.slice(0, 20), table: { columns: ["Customer", "Invoice", "Reason", "Outstanding"], rows: approvals.slice(0, 10).map((a) => [a.customerName, a.invoiceNumber, a.reason, formatMoney(a.amountOutstanding)]) } };
  }
  if (/(unmatched|ambiguous|review).*payment|payment.*(unmatched|ambiguous|review)/.test(lower)) {
    const review = await repository.listPayments(companyId, "payment_match_review_required");
    return { answer: `${review.length} payments need a matching decision before they can be applied.`, tool: "get_payments_in_review", data: review, table: { columns: ["Reference", "Date", "Amount"], rows: review.map((p) => [p.paymentReference, p.paymentDate, formatMoney(p.amount)]) } };
  }
  if (/(due this week|due next|upcoming)/.test(lower)) {
    return { answer: `${formatMoney(overview.dueThisWeek)} falls due in the next seven days.`, tool: "get_collection_overview", data: { dueThisWeek: overview.dueThisWeek } };
  }
  if (lower.includes("collected") || (lower.includes("received") && lower.includes("month"))) {
    return { answer: `${formatMoney(overview.collectedThisMonth)} has been collected and matched this month.`, tool: "get_collection_overview", data: { collectedThisMonth: overview.collectedThisMonth } };
  }
  if (/(top|highest|largest|biggest|most)/.test(lower)) {
    const top = (await repository.listCustomers(companyId)).slice(0, 10);
    return { answer: `The customer with the most overdue exposure is ${top[0]?.name ?? "not available"} at ${formatMoney(top[0]?.overdue ?? 0)} overdue.`, tool: "get_customer_exposure", data: top, table: { columns: ["Customer", "Overdue", "Outstanding", "Open cases"], rows: top.map((c) => [c.name, formatMoney(c.overdue), formatMoney(c.outstanding), c.openCases]) } };
  }
  const invoiceMatch = question.match(/INV-\d+/i);
  if (invoiceMatch) {
    const item = (await repository.listCases(companyId, { q: invoiceMatch[0] })).find((c) => c.invoice.invoiceNumber.toLowerCase() === invoiceMatch[0].toLowerCase());
    if (item) return { answer: `${item.invoice.invoiceNumber} (${item.customer.name}) has ${formatMoney(item.invoice.amountOutstanding)} outstanding, is ${item.daysOverdue} days overdue and its case is ${item.status.replaceAll("_", " ")}. Next action: ${item.nextAction}.`, tool: "get_case_by_invoice", data: { caseId: item.id, status: item.status } };
    return { answer: `I could not find an open collection case for ${invoiceMatch[0].toUpperCase()}.`, tool: "get_case_by_invoice", data: null };
  }
  const customer = (await repository.listCustomers(companyId)).find((c) => lower.includes(c.name.toLowerCase()) || lower.includes(c.customerCode.toLowerCase()));
  if (customer) {
    const cases = await repository.listCases(companyId, { customerId: customer.id, statuses: OPEN_CASE_STATUSES });
    return { answer: `${customer.name} owes ${formatMoney(customer.outstanding)}, of which ${formatMoney(customer.overdue)} is overdue across ${cases.length} open cases.`, tool: "get_customer_exposure", data: customer, table: { columns: ["Invoice", "Outstanding", "Days overdue", "Status"], rows: cases.map((c) => [c.invoice.invoiceNumber, formatMoney(c.invoice.amountOutstanding), c.daysOverdue, c.status.replaceAll("_", " ")]) } };
  }
  return { answer: `${formatMoney(overview.totalOverdue)} is currently overdue across ${overview.overdueInvoiceCount} invoices, out of ${formatMoney(overview.totalOutstanding)} outstanding.`, tool: "get_collection_overview", data: overview };
}

function agingTable(aging: Array<{ label: string; amount: number; count: number }>): QueryTable {
  return { columns: ["Bucket", "Invoices", "Amount"], rows: aging.map((bucket) => [bucket.label, bucket.count, formatMoney(bucket.amount)]) };
}
