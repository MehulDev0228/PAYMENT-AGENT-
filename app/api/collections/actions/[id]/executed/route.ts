import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";
const Input = z.object({ subject: z.string().min(1), body: z.string().min(1), externalMessageId: z.string().optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const context = await getApiContext(request, { automation: true }); requireManager(context); const { id } = await params; return NextResponse.json(await repository.markActionExecuted(context, id, Input.parse(await request.json()))); } catch (error) { return apiError(error, "Execution log failed"); } }
