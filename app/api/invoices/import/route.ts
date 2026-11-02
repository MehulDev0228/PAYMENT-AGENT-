import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";
import { INVOICE_COLUMNS, asNumber, parseWorkbook, pickColumns } from "@/lib/imports";

const InvoiceRow = z.object({
  invoice_number: z.coerce.string().min(1, "bill number is missing"), customer_email: z.string().email("customer email is not valid"),
  amount: z.number().positive("amount due must be more than zero"), due_date: z.string().min(8, "due date is missing"),
  customer_name: z.string().optional(), invoice_date: z.string().optional(), currency: z.string().length(3).optional(),
  customer_code: z.coerce.string().optional(), customer_phone: z.coerce.string().optional(),
});

export async function POST(request: Request) {
  try {
    const context = getRequestContext(request); requireManager(context);
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a CSV or XLSX file using the field name 'file'." }, { status: 400 });
    const { rows: picked, ignored } = pickColumns(await parseWorkbook(file), INVOICE_COLUMNS);
    const rows = picked.map((item, index) => {
      const parsed = InvoiceRow.safeParse({ ...item, amount: asNumber(item.amount), currency: item.currency ? String(item.currency).toUpperCase() : undefined });
      if (!parsed.success) throw new Error(`Row ${index + 2}: ${parsed.error.issues[0]?.message}`);
      return parsed.data;
    });
    return NextResponse.json({ ...(await repository.importInvoices(context.companyId, rows, context.userId)), ignoredColumns: ignored });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 }); }
}
