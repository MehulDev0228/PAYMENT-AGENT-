import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";
import { CALL_OUTCOMES } from "@/lib/domain/collector";
import type { CallOutcome } from "@/lib/domain/types";

const Input = z.object({
  outcome: z.enum(CALL_OUTCOMES as [CallOutcome, ...CallOutcome[]]),
  note: z.string().max(2000).optional(),
  nextFollowUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiContext(request); const { id } = await params;
    const item = await repository.getCase(context, id);
    return item ? NextResponse.json(item.followUps) : NextResponse.json({ error: "Case not found" }, { status: 404 });
  } catch (error) {
    return apiError(error, "Lookup failed", 500);
  }
}

/** Managers log a call: outcome, note and the next follow-up date. Audited as follow_up_logged. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiContext(request); requireManager(context);
    const { id } = await params; const input = Input.parse(await request.json());
    return NextResponse.json(await repository.logFollowUp(context, id, input, context.userId), { status: 201 });
  } catch (error) {
    return apiError(error, "Could not log the follow-up");
  }
}
