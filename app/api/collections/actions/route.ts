import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
export async function GET(request: Request) { try { const context = await getApiContext(request, { automation: true }); const status = new URL(request.url).searchParams.get("status") || undefined; return NextResponse.json(await repository.listActions(context.companyId, status)); } catch (error) { return apiError(error, "Lookup failed", 500); } }
