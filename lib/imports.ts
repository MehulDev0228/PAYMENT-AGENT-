import readXlsxFile from "read-excel-file/node";

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
  amount: ["amount_due", "due_amount", "balance", "outstanding", "amount_outstanding", "unpaid", "total"],
  due_date: ["due", "due_on", "payment_due"],
  customer_name: ["customer", "name", "party", "party_name", "client"],
  invoice_date: ["bill_date", "date"],
  currency: [],
  customer_code: ["code", "party_code"],
  customer_phone: ["phone", "mobile"],
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
