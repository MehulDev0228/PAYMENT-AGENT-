import { NextResponse } from "next/server";
import { apiError, getApiContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import type { Payment } from "@/lib/domain/types";

export const dynamic = "force-dynamic";
const STATUSES = new Set<Payment["matchStatus"]>(["matched", "unmatched", "payment_match_review_required"]);

export async function GET(request: Request) {
  try {
    const context = await getApiContext(request);
    const status = new URL(request.url).searchParams.get("status") as Payment["matchStatus"] | null;
    return NextResponse.json(await repository.listPayments(context.companyId, status && STATUSES.has(status) ? status : undefined));
  } catch (error) {
    return apiError(error, "Lookup failed", 500);
  }
}
