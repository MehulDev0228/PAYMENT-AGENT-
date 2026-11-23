import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
export async function GET(request: Request) { try { const context = await getApiContext(request, { automation: true }); return NextResponse.json(await repository.summary(context)); } catch (error) { return apiError(error, "Summary failed", 500); } }
