import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const context = await getApiContext(request); const { id } = await params; const item = await repository.getCase(context.companyId, id); return item ? NextResponse.json(item) : NextResponse.json({ error: "Case not found" }, { status: 404 }); } catch (error) { return apiError(error, "Lookup failed", 500); } }
