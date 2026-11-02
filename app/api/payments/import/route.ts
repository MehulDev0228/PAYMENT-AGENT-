import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";
import { PAYMENT_COLUMNS, asNumber, parseWorkbook, pickColumns } from "@/lib/imports";

const PaymentRow = z.object({ payment_reference: z.coerce.string().min(1, "reference is missing"), invoice_number: z.coerce.string().optional(), amount: z.number().positive("amount must be more than zero"), payment_date: z.string().min(8, "date is missing"), customer_code: z.coerce.string().optional() });

export async function POST(request: Request) {
  try {
    const context = getRequestContext(request); requireManager(context);
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a CSV or XLSX file using the field name 'file'." }, { status: 400 });
    const { rows: picked, ignored } = pickColumns(await parseWorkbook(file), PAYMENT_COLUMNS);
    const rows = picked.map((item, index) => {
      const parsed = PaymentRow.safeParse({ ...item, amount: asNumber(item.amount) });
      if (!parsed.success) throw new Error(`Row ${index + 2}: ${parsed.error.issues[0]?.message}`);
      return parsed.data;
    });
    return NextResponse.json({ ...(await repository.importPayments(context.companyId, rows)), ignoredColumns: ignored });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 }); }
}
