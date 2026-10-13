import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
export async function GET(request: Request) { const context = getRequestContext(request); return NextResponse.json(repository.overdueInvoices(context.companyId)); }
