import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { classifyCustomerReply } from "@/lib/ai/customer-reply";

const Input = z.object({ from: z.string().email(), subject: z.string(), body: z.string().min(1).max(20_000), externalMessageId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const context = getRequestContext(request);
    const input = Input.parse(await request.json());
    // The classifier only describes the message; the repository applies deterministic rules to decide the outcome.
    const classification = await classifyCustomerReply(input.body, await repository.today(context.companyId));
    const recorded = await repository.recordReply(context.companyId, input, classification);
    return NextResponse.json({ ...classification, ...recorded });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reply processing failed" }, { status: 400 });
  }
}
