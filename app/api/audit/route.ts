import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getApiContext(request);
    const params = new URL(request.url).searchParams;
    const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));
    return NextResponse.json(await repository.listAudit(context, { entityId: params.get("entityId") || undefined, limit }));
  } catch (error) {
    return apiError(error, "Lookup failed", 500);
  }
}
