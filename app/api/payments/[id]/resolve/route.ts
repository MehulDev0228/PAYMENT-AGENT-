import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";

const Input = z.object({ invoiceId: z.string().min(1) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = getRequestContext(request); const { id } = await params;
    return NextResponse.json(repository.paymentCandidates(context.companyId, id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lookup failed" }, { status: 404 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = getRequestContext(request); requireManager(context);
    const { id } = await params; const input = Input.parse(await request.json());
    return NextResponse.json(repository.resolvePayment(context.companyId, id, input.invoiceId, context.userId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resolution failed" }, { status: 400 });
  }
}
