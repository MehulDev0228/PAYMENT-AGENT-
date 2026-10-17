import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getApiContext(request);
    return NextResponse.json(await repository.listCustomers(context.companyId, new URL(request.url).searchParams.get("q") || undefined));
  } catch (error) {
    return apiError(error, "Lookup failed", 500);
  }
}
