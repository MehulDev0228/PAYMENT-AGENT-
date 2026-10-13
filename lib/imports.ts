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
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/[\s-]+/g, "_"), value]));
}

export function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/[₹,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
