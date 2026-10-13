import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { const context = getRequestContext(request); const { id } = await params; const item = repository.getCase(context.companyId, id); return item ? NextResponse.json(item) : NextResponse.json({ error: "Case not found" }, { status: 404 }); }
