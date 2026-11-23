import { NextResponse } from "next/server";
import { apiError, getApiContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";
import { parseInvoiceRows, parseWorkbook } from "@/lib/imports";

/**
 * Daily ledger sync. Form fields: `file` (CSV/XLSX), `mode` ("preview" returns the result without saving,
 * anything else commits) and `fullLedger` ("true" when the file is the complete open-invoice ledger).
 */
export async function POST(request: Request) {
  try {
    const context = await getApiContext(request); requireManager(context);
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a CSV or XLSX file using the field name 'file'." }, { status: 400 });
    const raw = await parseWorkbook(file);
    if (!raw.length) return NextResponse.json({ error: "The file has no bill rows." }, { status: 400 });
    const { rows, invalidRows, ignored } = parseInvoiceRows(raw);
    const options = { dryRun: form.get("mode") === "preview", fullLedger: form.get("fullLedger") === "true", invalidRows };
    return NextResponse.json({ ...(await repository.importInvoices(context, rows, context.userId, options)), ignoredColumns: ignored });
  } catch (error) { return apiError(error, "Upload failed"); }
}
