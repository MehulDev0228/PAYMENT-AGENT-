import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { withRegion } from "@/lib/data/repository";
export async function GET(request: Request) { try { const context = await getApiContext(request); return NextResponse.json(await repository.listPromises(withRegion(context, new URL(request.url).searchParams.get("region")))); } catch (error) { return apiError(error, "Lookup failed", 500); } }
