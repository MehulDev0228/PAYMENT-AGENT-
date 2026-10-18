import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";

const Input = z.object({ assigneeId: z.string().min(1).nullable() });

/** Managers give a case to a workspace user (or unassign it with null). Every change is audited. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiContext(request); requireManager(context);
    const { id } = await params; const input = Input.parse(await request.json());
    return NextResponse.json(await repository.assignCase(context, id, input.assigneeId, context.userId));
  } catch (error) {
    return apiError(error, "Assignment failed");
  }
}
