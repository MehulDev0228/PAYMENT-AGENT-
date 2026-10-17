import { NextResponse } from "next/server";
import { apiError, getApiContext, requireManager } from "@/lib/auth";
import { repository } from "@/lib/data";
export async function POST(request: Request) { try { const context = await getApiContext(request, { automation: true }); requireManager(context); return NextResponse.json(await repository.checkPromises(context.companyId)); } catch (error) { return apiError(error, "Promise check failed", 500); } }
