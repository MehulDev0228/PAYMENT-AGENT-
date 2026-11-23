import writeXlsxFile, { type Cell, type Sheet } from "write-excel-file/node";
import { withRegion, type KindlyPayRepository, type DataScope } from "@/lib/data/repository";
import { CASE_VIEWS, isCaseView } from "@/lib/domain/case-views";
import { AGEING_BUCKETS, CALL_OUTCOME_LABELS, resolveAssigneeFilter } from "@/lib/domain/collector";
import type { AgeingRow, CaseListItem, CollectionCase, CustomerSummary, Payment, PaymentListItem } from "@/lib/domain/types";

/**
 * Spreadsheet exports of the workspace views. Each report is a list of typed tables built from the
 * same repository calls and filters as its page, then written as .xlsx (all sheets) or .csv (first sheet).
 */

export const EXPORT_REPORTS = ["cases", "customers", "payments", "ageing"] as const;
export type ExportReport = (typeof EXPORT_REPORTS)[number];
export type ExportFormat = "xlsx" | "csv";

type ColumnKind = "text" | "money" | "number" | "date";
export interface ExportColumn<T> { header: string; kind?: ColumnKind; width?: number; value: (row: T) => string | number | undefined | null }
export interface ExportTable { sheet: string; columns: Array<Omit<ExportColumn<never>, "value">>; rows: Array<Array<string | number | null>>; totals?: Array<string | number | null> }

function table<T>(sheet: string, columns: Array<ExportColumn<T>>, items: T[], totals?: Array<string | number | null>): ExportTable {
  return {
    sheet,
    columns: columns.map(({ header, kind, width }) => ({ header, kind, width })),
    rows: items.map((item) => columns.map((column) => column.value(item) ?? null)),
    totals,
  };
}

export function isExportReport(value: string): value is ExportReport {
  return (EXPORT_REPORTS as readonly string[]).includes(value);
}

const PRIORITIES: Array<CollectionCase["priority"]> = ["critical", "high", "medium", "low"];
const MATCH_STATUSES: Array<Payment["matchStatus"]> = ["matched", "payment_match_review_required", "unmatched"];
const humanize = (value: string) => value.replaceAll("_", " ");

const CASE_COLUMNS: Array<ExportColumn<CaseListItem>> = [
  { header: "Invoice", value: (item) => item.invoice.invoiceNumber, width: 14 },
  { header: "Customer", value: (item) => item.customer.name, width: 28 },
  { header: "Customer code", value: (item) => item.customer.customerCode, width: 14 },
  { header: "Region", value: (item) => item.customer.region, width: 10 },
  { header: "Status", value: (item) => humanize(item.status), width: 18 },
  { header: "Priority", value: (item) => item.priority, width: 10 },
  { header: "Due date", kind: "date", value: (item) => item.invoice.dueDate },
  { header: "Days overdue", kind: "number", value: (item) => item.daysOverdue },
  { header: "Invoice amount", kind: "money", value: (item) => item.invoice.amount },
  { header: "Outstanding", kind: "money", value: (item) => item.invoice.amountOutstanding },
  { header: "Currency", value: (item) => item.invoice.currency, width: 9 },
  { header: "Assigned to", value: (item) => item.assigneeName ?? (item.assignedTo ? "Unknown user" : "Unassigned"), width: 18 },
  { header: "Next action", value: (item) => item.nextAction, width: 36 },
  { header: "Promised date", kind: "date", value: (item) => item.activePromise?.promisedDate },
  { header: "Last call outcome", value: (item) => (item.lastFollowUp ? CALL_OUTCOME_LABELS[item.lastFollowUp.outcome] : undefined), width: 16 },
  { header: "Last call note", value: (item) => item.lastFollowUp?.note, width: 40 },
  { header: "Next follow-up", kind: "date", value: (item) => item.lastFollowUp?.nextFollowUpDate },
];

const CUSTOMER_COLUMNS: Array<ExportColumn<CustomerSummary>> = [
  { header: "Customer code", value: (item) => item.customerCode, width: 14 },
  { header: "Customer", value: (item) => item.name, width: 28 },
  { header: "Email", value: (item) => item.email, width: 32 },
  { header: "Phone", value: (item) => item.phone, width: 16 },
  { header: "Region", value: (item) => item.region, width: 10 },
  { header: "Account manager", value: (item) => item.accountManager, width: 18 },
  { header: "Status", value: (item) => humanize(item.status), width: 10 },
  { header: "Outstanding", kind: "money", value: (item) => item.outstanding },
  { header: "Overdue", kind: "money", value: (item) => item.overdue },
  { header: "Open invoices", kind: "number", value: (item) => item.openInvoices },
  { header: "Open cases", kind: "number", value: (item) => item.openCases },
  { header: "Oldest overdue (days)", kind: "number", value: (item) => item.maxDaysOverdue },
];

const PAYMENT_COLUMNS: Array<ExportColumn<PaymentListItem>> = [
  { header: "Reference", value: (item) => item.paymentReference, width: 22 },
  { header: "Payment date", kind: "date", value: (item) => item.paymentDate },
  { header: "Amount", kind: "money", value: (item) => item.amount },
  { header: "Match status", value: (item) => (item.matchStatus === "payment_match_review_required" ? "needs review" : item.matchStatus), width: 14 },
  { header: "Invoice", value: (item) => item.invoiceNumber, width: 14 },
  { header: "Customer", value: (item) => item.customerName, width: 28 },
  { header: "Source", value: (item) => humanize(item.source), width: 14 },
  { header: "Notes", value: (item) => item.matchNotes, width: 48 },
];

const AGEING_COLUMNS: Array<ExportColumn<AgeingRow>> = [
  { header: "Customer code", value: (item) => item.customerCode, width: 14 },
  { header: "Customer", value: (item) => item.customerName, width: 28 },
  { header: "Region", value: (item) => item.region, width: 10 },
  { header: "Account manager", value: (item) => item.accountManager, width: 18 },
  ...AGEING_BUCKETS.map(({ key, label }): ExportColumn<AgeingRow> => ({ header: label, kind: "money", value: (item) => item[key] })),
  { header: "Total outstanding", kind: "money", value: (item) => item.total },
  { header: "Open invoices", kind: "number", value: (item) => item.openInvoices },
];

/** Builds a report from the same filters the page uses (query string of the page URL). */
/** `scope` is the caller's context: a regional user exports only their regions, and ?region= narrows further. */
export async function buildReport(repository: KindlyPayRepository, callerScope: DataScope, userId: string, report: ExportReport, params: URLSearchParams): Promise<{ title: string; tables: ExportTable[] }> {
  const scope = withRegion(callerScope, params.get("region"));
  if (report === "cases") {
    const view = params.get("view") ?? undefined;
    const statuses = CASE_VIEWS[isCaseView(view) ? view : "open"].statuses;
    const priority = PRIORITIES.find((item) => item === params.get("priority"));
    const assignedTo = resolveAssigneeFilter(params.get("assignee"), userId);
    const cases = await repository.listCases(scope, { statuses, q: params.get("q")?.trim() || undefined, priority, assignedTo });
    return { title: "cases", tables: [table("Cases", CASE_COLUMNS, cases)] };
  }
  if (report === "customers") {
    const customers = await repository.listCustomers(scope, params.get("q")?.trim() || undefined);
    return { title: "customers", tables: [table("Customers", CUSTOMER_COLUMNS, customers)] };
  }
  if (report === "payments") {
    const status = MATCH_STATUSES.find((item) => item === params.get("status"));
    const payments = await repository.listPayments(scope, status);
    return { title: "payments", tables: [table("Payments", PAYMENT_COLUMNS, payments)] };
  }
  const ageing = await repository.ageingReport(scope);
  const totals = ["", `Total (${ageing.rows.length} customers)`, "", "", ...AGEING_BUCKETS.map(({ key }) => ageing.totals[key]), ageing.totals.total, ageing.totals.openInvoices];
  const detail = table("Open invoices", [
    { header: "Invoice", value: (item) => item.invoice.invoiceNumber, width: 14 },
    { header: "Customer", value: (item) => item.customer.name, width: 28 },
    { header: "Customer code", value: (item) => item.customer.customerCode, width: 14 },
    { header: "Invoice date", kind: "date", value: (item) => item.invoice.invoiceDate },
    { header: "Due date", kind: "date", value: (item) => item.invoice.dueDate },
    { header: "Days overdue", kind: "number", value: (item) => item.daysOverdue },
    { header: "Ageing band", value: (item) => AGEING_BUCKETS.find((bucket) => bucket.key === item.bucket)!.label, width: 12 },
    { header: "Invoice amount", kind: "money", value: (item) => item.invoice.amount },
    { header: "Outstanding", kind: "money", value: (item) => item.invoice.amountOutstanding },
  ], ageing.invoices);
  return { title: `ageing-${ageing.asOf}`, tables: [table(`Ageing ${ageing.asOf}`, AGEING_COLUMNS, ageing.rows, totals), detail] };
}

// ---------------------------------------------------------------- writers

// A text cell that Excel would evaluate as a formula. Plain numbers and phone numbers ("+91 90000 00081") cannot call functions, so they pass.
const FORMULA_LIKE = (text: string) => /^[=+\-@\t\r]/.test(text) && !/^[+-][\d\s().,+-]*$/.test(text);

/** RFC 4180 CSV with a UTF-8 BOM so Excel shows ₹ and names correctly. Text that starts like a formula is neutralised. */
export function toCsv(input: ExportTable): string {
  const escape = (value: string | number | null) => {
    if (value === null) return "";
    let text = String(value);
    if (typeof value === "string" && FORMULA_LIKE(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [input.columns.map((column) => column.header), ...input.rows, ...(input.totals ? [input.totals] : [])];
  return `﻿${lines.map((line) => line.map(escape).join(",")).join("\r\n")}\r\n`;
}

const FORMATS: Record<ColumnKind, string | undefined> = { text: undefined, money: "#,##0.00", number: "0", date: "dd-mmm-yyyy" };
const DEFAULT_WIDTH: Record<ColumnKind, number> = { text: 16, money: 15, number: 12, date: 13 };

function cell(value: string | number | null, kind: ColumnKind, bold = false): Cell {
  if (value === null || value === "") return bold ? { value: "", fontWeight: "bold" } : null;
  const style = bold ? { fontWeight: "bold" as const } : {};
  if (kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return { value: new Date(`${value.slice(0, 10)}T00:00:00.000Z`), type: Date, format: FORMATS.date, ...style };
  }
  if (typeof value === "number") return { value, type: Number, format: FORMATS[kind], ...style };
  return { value, type: String, ...style };
}

export async function toXlsx(tables: ExportTable[]): Promise<Buffer> {
  const sheets: Array<Sheet<Buffer>> = tables.map((input) => ({
    sheet: input.sheet.slice(0, 31),
    stickyRowsCount: 1,
    columns: input.columns.map((column) => ({ width: column.width ?? DEFAULT_WIDTH[column.kind ?? "text"] })),
    data: [
      input.columns.map((column) => ({ value: column.header, fontWeight: "bold" as const, backgroundColor: "#EEF0F3" })),
      ...input.rows.map((row) => row.map((value, index) => cell(value, input.columns[index].kind ?? "text"))),
      ...(input.totals ? [input.totals.map((value, index) => cell(value, input.columns[index].kind ?? "text", true))] : []),
    ],
  }));
  return writeXlsxFile(sheets).toBuffer();
}

export function exportFileName(title: string, asOf: string, format: ExportFormat) {
  return `kindlypay-${title}${title.includes(asOf) ? "" : `-${asOf}`}.${format}`;
}
