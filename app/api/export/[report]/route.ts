import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { buildReport, exportFileName, isExportReport, toCsv, toXlsx, type ExportFormat } from "@/lib/exports";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

/** GET /api/export/{cases|customers|payments|ageing}?format=xlsx|csv plus the page's own filters. Read-only, so viewers may export. */
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  try {
    const context = await getApiContext(request);
    const { report } = await params;
    if (!isExportReport(report)) return NextResponse.json({ error: `Unknown report "${report}"` }, { status: 404 });
    const search = new URL(request.url).searchParams;
    const format: ExportFormat = search.get("format") === "csv" ? "csv" : "xlsx";
    const built = await buildReport(repository, context.companyId, context.userId, report, search);
    const body = format === "csv" ? toCsv(built.tables[0]) : await toXlsx(built.tables);
    const filename = exportFileName(built.title, await repository.today(context.companyId), format);
    return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
      headers: { "content-type": CONTENT_TYPES[format], "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error, "Export failed", 500);
  }
}
