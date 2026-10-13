import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
export async function POST(request: Request) { const context = getRequestContext(request); return NextResponse.json(repository.runDailyMonitor(context.companyId)); }
