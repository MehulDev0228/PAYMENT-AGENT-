import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";
import { asNumber, normalizeHeaders, parseWorkbook } from "@/lib/imports";

const PaymentRow = z.object({ payment_reference: z.string().min(1), invoice_number: z.string().optional(), amount: z.number().positive(), payment_date: z.string().min(8), customer_code: z.string().optional() });

export async function POST(request: Request) {
  try {
    const context = getRequestContext(request); requireManager(context);
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a CSV or XLSX file using the field name 'file'." }, { status: 400 });
    const raw = await parseWorkbook(file);
    const rows = raw.map((item) => { const normalized = normalizeHeaders(item); return PaymentRow.parse({ ...normalized, amount: asNumber(normalized.amount) }); });
    return NextResponse.json(await repository.importPayments(context.companyId, rows));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 }); }
}
