import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";

const Input = z.object({ invoiceId: z.string().min(1) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiContext(request); const { id } = await params;
    return NextResponse.json(await repository.paymentCandidates(context, id));
  } catch (error) {
    return apiError(error, "Lookup failed", 404);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiContext(request); requireManager(context);
    const { id } = await params; const input = Input.parse(await request.json());
    return NextResponse.json(await repository.resolvePayment(context, id, input.invoiceId, context.userId));
  } catch (error) {
    return apiError(error, "Resolution failed");
  }
}
