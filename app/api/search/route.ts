import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = getRequestContext(request);
  const q = (new URL(request.url).searchParams.get("q") || "").slice(0, 80);
  return NextResponse.json(await repository.search(context.companyId, q));
}
