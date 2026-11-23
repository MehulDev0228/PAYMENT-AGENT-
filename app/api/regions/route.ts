import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import type { RegionSummary } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const cell = (value: string | number) => (typeof value === "number" ? String(Math.round(value * 100) / 100) : /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

function toCsv(rows: RegionSummary[]): string {
  const buckets = rows[0]?.aging.map((bucket) => bucket.label) ?? [];
  const header = ["Region", "Customers", "Outstanding", "Overdue", "Overdue invoices", ...buckets, "Promises due (7 days)", "Promises due amount", "Missed promises", "Collected this month"];
  const lines = rows.map((row) => [
    row.region ?? "No region", row.customerCount, row.totalOutstanding, row.totalOverdue, row.overdueInvoiceCount, ...row.aging.map((bucket) => bucket.amount),
    row.promisesDueCount, row.promisesDueAmount, row.missedPromiseCount, row.collectedThisMonth,
  ]);
  return [header, ...lines].map((line) => line.map(cell).join(",")).join("\r\n");
}

/** Receivables per region the caller can see: outstanding, overdue, ageing, promises due, collected this month. `?format=csv` for a sheet. */
export async function GET(request: Request) {
  try {
    const context = await getApiContext(request);
    const rows = await repository.regionSummary(context);
    if (new URL(request.url).searchParams.get("format") !== "csv") return NextResponse.json(rows);
    const today = await repository.today(context);
    return new NextResponse(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="kindlypay-regions-${today}.csv"` } });
  } catch (error) {
    return apiError(error, "Lookup failed", 500);
  }
}
