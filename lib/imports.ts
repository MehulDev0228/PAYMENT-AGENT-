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
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/[\s-]+/g, "_"), value]));
}

export function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/[₹,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const OUTSTANDING_HEADERS = ["outstanding", "outstanding_amount", "amount_outstanding", "balance", "balance_due", "closing_balance", "pending_amount"];
const OPTIONAL_TEXT = ["customer_code", "customer_phone", "region", "account_manager"] as const;

const InvoiceRow = z.object({
  invoice_number: z.string().min(1), customer_name: z.string().min(1), customer_email: z.string().email(),
  invoice_date: z.string().min(8), due_date: z.string().min(8), amount: z.number().positive(), currency: z.string().length(3),
  customer_code: z.string().optional(), customer_phone: z.string().optional(), region: z.string().optional(), account_manager: z.string().optional(),
  outstanding: z.number().nonnegative().optional(),
});

/**
 * Validates an invoice ledger export row by row. A bad row is reported against its spreadsheet row number
 * instead of failing the whole file, and keeps its invoice number so a full-ledger sync knows it was listed.
 */
export function parseInvoiceRows(raw: Record<string, unknown>[]): { rows: InvoiceImportRow[]; invalidRows: NonNullable<InvoiceSyncOptions["invalidRows"]> } {
  const rows: InvoiceImportRow[] = [];
  const invalidRows: NonNullable<InvoiceSyncOptions["invalidRows"]> = [];
  raw.forEach((item, index) => {
    const row = index + 2;
    const normalized = normalizeHeaders(item);
    const text = (value: unknown) => (value === undefined || value === null || String(value).trim() === "" ? undefined : String(value).trim());
    const balanceHeader = OUTSTANDING_HEADERS.find((header) => text(normalized[header]) !== undefined);
    const balance = balanceHeader ? Number(String(normalized[balanceHeader]).replace(/[₹,$\s]/g, "")) : undefined;
    const invoiceNumber = text(normalized.invoice_number);
    const parsed = InvoiceRow.safeParse({
      invoice_number: invoiceNumber ?? "", customer_name: text(normalized.customer_name) ?? "", customer_email: text(normalized.customer_email) ?? "",
      invoice_date: text(normalized.invoice_date) ?? "", due_date: text(normalized.due_date) ?? "",
      amount: asNumber(normalized.amount), currency: String(normalized.currency ?? "").trim().toUpperCase(),
      ...Object.fromEntries(OPTIONAL_TEXT.map((field) => [field, text(normalized[field])])),
      outstanding: balance,
    });
    if (parsed.success) rows.push({ ...parsed.data, row });
    else {
      const issue = parsed.error.issues[0];
      invalidRows.push({ row, invoiceNumber, message: `${issue.path.join(".") || "row"}: ${issue.message}` });
    }
  });
  return { rows, invalidRows };
}
