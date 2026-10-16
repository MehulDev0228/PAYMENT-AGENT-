import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";
import { asNumber, normalizeHeaders, parseWorkbook } from "@/lib/imports";

const InvoiceRow = z.object({
  invoice_number: z.string().min(1), customer_name: z.string().min(1), customer_email: z.string().email(),
  invoice_date: z.string().min(8), due_date: z.string().min(8), amount: z.number().positive(), currency: z.string().length(3),
  customer_code: z.string().optional(), customer_phone: z.string().optional(), region: z.string().optional(), account_manager: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const context = getRequestContext(request); requireManager(context);
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a CSV or XLSX file using the field name 'file'." }, { status: 400 });
    const raw = await parseWorkbook(file);
    const rows = raw.map((item) => { const normalized = normalizeHeaders(item); return InvoiceRow.parse({ ...normalized, amount: asNumber(normalized.amount), currency: String(normalized.currency).toUpperCase() }); });
    return NextResponse.json(await repository.importInvoices(context.companyId, rows, context.userId));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 }); }
}
