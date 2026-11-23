import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { withRegion } from "@/lib/data/repository";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const context = await getApiContext(request); return NextResponse.json(await repository.overview(withRegion(context, new URL(request.url).searchParams.get("region")))); } catch (error) { return apiError(error, "Lookup failed", 500); } }
