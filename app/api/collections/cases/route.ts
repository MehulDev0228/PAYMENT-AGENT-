import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { withRegion } from "@/lib/data/repository";
import { CASE_VIEWS, isCaseView } from "@/lib/domain/case-views";
import type { CaseStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getApiContext(request);
    const params = new URL(request.url).searchParams;
    const view = params.get("view") || undefined;
    const status = params.get("status");
    const statuses = status ? [status as CaseStatus] : isCaseView(view) ? CASE_VIEWS[view].statuses : undefined;
    return NextResponse.json(await repository.listCases(withRegion(context, params.get("region")), { statuses, q: params.get("q") || undefined }));
  } catch (error) {
    return apiError(error, "Lookup failed", 500);
  }
}
