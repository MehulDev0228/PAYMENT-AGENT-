import readXlsxFile from "read-excel-file/node";
import { z } from "zod";
import type { InvoiceImportRow, InvoiceSyncOptions } from "@/lib/data/repository";

export async function parseWorkbook(file: File): Promise<Record<string, unknown>[]> {
  if (file.name.toLowerCase().endsWith(".csv")) return csvToObjects(await file.text());
  const sheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
  const rows = sheets[0]?.data;
  if (!rows) throw new Error("The uploaded workbook has no sheets");
  if (rows.length < 2) throw new Error("The uploaded workbook has no data rows");
  const headers = rows[0].map((value) => String(value ?? ""));
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])])));
}

function normalizeCell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? "";
}

function csvToObjects(input: string): Record<string, unknown>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"' && quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && input[index + 1] === "\n") index += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((value) => value.trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

export function normalizeHeaders(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
}

const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * Maps the column names people actually use ("Bill No.", "Amount due", "Email") onto KindlyPay's fields,
 * and keeps only those. Anything else in the sheet (rates, quantities, cash columns) is dropped before
 * a row reaches the database, and reported back as ignored.
 */
export function pickColumns(rows: Record<string, unknown>[], aliases: Record<string, string[]>): { rows: Record<string, unknown>[]; ignored: string[] } {
  const lookup = new Map(Object.entries(aliases).flatMap(([field, names]) => [field, ...names].map((name) => [normalizeKey(name), field] as const)));
  const headers = Object.keys(rows[0] ?? {});
  const ignored = headers.filter((header) => header.trim() && !lookup.has(normalizeKey(header)));
  return {
    ignored,
    rows: rows.map((row) => {
      const picked: Record<string, unknown> = {};
      for (const [header, value] of Object.entries(row)) {
        const field = lookup.get(normalizeKey(header));
        if (field && picked[field] === undefined && value !== "") picked[field] = typeof value === "string" ? value.trim() : value;
      }
      return picked;
    }),
  };
}

export const INVOICE_COLUMNS: Record<string, string[]> = {
  invoice_number: ["bill_number", "bill_no", "bill", "invoice_no", "invoice", "invoice_id"],
  customer_email: ["email", "customer_mail", "billing_email", "email_id"],
  amount: ["amount_due", "due_amount", "unpaid", "total", "invoice_amount", "bill_amount"],
  due_date: ["due", "due_on", "payment_due"],
  customer_name: ["customer", "name", "party", "party_name", "client"],
  invoice_date: ["bill_date", "date"],
  currency: [],
  customer_code: ["code", "party_code"],
  customer_phone: ["phone", "mobile"],
  region: ["zone", "area", "territory", "branch"],
  account_manager: ["salesperson", "sales_person", "manager", "owner"],
  // The ERP's own balance, kept beside the amount so a mismatch with KindlyPay is flagged, not copied over.
  outstanding: ["outstanding_amount", "amount_outstanding", "balance", "balance_due", "closing_balance", "pending_amount"],
};

export const PAYMENT_COLUMNS: Record<string, string[]> = {
  payment_reference: ["reference", "utr", "ref", "transaction_id", "txn_id"],
  amount: ["amount_received", "credit", "received"],
  payment_date: ["date", "value_date", "received_on"],
  invoice_number: ["bill_number", "bill_no", "invoice_no", "invoice", "bill"],
  customer_code: ["code", "party_code"],
};

export function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/[₹,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const InvoiceRow = z.object({
  invoice_number: z.string().min(1, "bill number is missing"), customer_email: z.string().email("customer email is not valid"),
  amount: z.number().positive("amount due must be more than zero"), due_date: z.string().min(8, "due date is missing"),
  customer_name: z.string().optional(), invoice_date: z.string().optional(), currency: z.string().length(3, "currency must be a 3-letter code").optional(),
  customer_code: z.string().optional(), customer_phone: z.string().optional(), region: z.string().optional(), account_manager: z.string().optional(),
  outstanding: z.number().nonnegative("balance cannot be negative").optional(),
});

/**
 * Reads an unpaid-bills sheet for the daily sync. Only bill number, customer email, amount due and due date
 * are required; known optional columns are kept and any other column is dropped (reported as ignored).
 * A bad row is reported against its spreadsheet row number instead of failing the whole file, and keeps its
 * bill number so a full-list sync knows it was listed.
 */
export function parseInvoiceRows(raw: Record<string, unknown>[]): { rows: InvoiceImportRow[]; invalidRows: NonNullable<InvoiceSyncOptions["invalidRows"]>; ignored: string[] } {
  const { rows: picked, ignored } = pickColumns(raw, INVOICE_COLUMNS);
  const rows: InvoiceImportRow[] = [];
  const invalidRows: NonNullable<InvoiceSyncOptions["invalidRows"]> = [];
  const text = (value: unknown) => (value === undefined || value === null || String(value).trim() === "" ? undefined : String(value).trim());
  picked.forEach((item, index) => {
    const row = index + 2;
    let amount = item.amount === undefined ? undefined : asNumber(item.amount);
    let outstanding = item.outstanding === undefined ? undefined : asNumber(item.outstanding);
    // A sheet with only a balance column: that balance is what is due.
    if (amount === undefined && outstanding !== undefined) { amount = outstanding; outstanding = undefined; }
    const invoiceNumber = text(item.invoice_number);
    const parsed = InvoiceRow.safeParse({
      invoice_number: invoiceNumber ?? "", customer_email: text(item.customer_email) ?? "", amount: amount ?? 0, due_date: text(item.due_date) ?? "",
      customer_name: text(item.customer_name), invoice_date: text(item.invoice_date), currency: text(item.currency)?.toUpperCase(),
      customer_code: text(item.customer_code), customer_phone: text(item.customer_phone), region: text(item.region), account_manager: text(item.account_manager),
      outstanding,
    });
    if (parsed.success) rows.push({ ...parsed.data, row });
    else invalidRows.push({ row, invoiceNumber, message: parsed.error.issues[0]?.message ?? "row is not valid" });
  });
  return { rows, invalidRows, ignored };
}
