import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";

const Input = z.object({ note: z.string().max(500).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = getRequestContext(request); requireManager(context);
    const { id } = await params;
    const body = request.headers.get("content-type")?.includes("application/json") ? Input.parse(await request.json()) : {};
    return NextResponse.json(await repository.decideAction(context.companyId, id, "rejected", context.userId, body.note));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Decision failed" }, { status: 400 });
  }
}
