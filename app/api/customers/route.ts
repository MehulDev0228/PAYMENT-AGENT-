import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = getRequestContext(request);
  return NextResponse.json(repository.listCustomers(context.companyId, new URL(request.url).searchParams.get("q") || undefined));
}
