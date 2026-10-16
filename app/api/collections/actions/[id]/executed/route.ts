import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
const Input = z.object({ subject: z.string().min(1), body: z.string().min(1), externalMessageId: z.string().optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const context = getRequestContext(request); const { id } = await params; return NextResponse.json(await repository.markActionExecuted(context.companyId, id, Input.parse(await request.json()))); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Execution log failed" }, { status: 400 }); } }
