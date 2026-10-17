import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const context = await getApiContext(request); return NextResponse.json(await repository.overview(context.companyId)); } catch (error) { return apiError(error, "Lookup failed", 500); } }
