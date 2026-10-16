import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
export async function GET(request: Request) { const context = getRequestContext(request); const status = new URL(request.url).searchParams.get("status") || undefined; return NextResponse.json(await repository.listActions(context.companyId, status)); }
