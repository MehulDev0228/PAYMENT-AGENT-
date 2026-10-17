import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getApiContext(request);
    const q = (new URL(request.url).searchParams.get("q") || "").slice(0, 80);
    return NextResponse.json(await repository.search(context.companyId, q));
  } catch (error) {
    return apiError(error, "Lookup failed", 500);
  }
}
