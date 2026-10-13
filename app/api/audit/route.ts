import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = getRequestContext(request);
  const params = new URL(request.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));
  return NextResponse.json(repository.listAudit(context.companyId, { entityId: params.get("entityId") || undefined, limit }));
}
