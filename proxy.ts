import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const expected = process.env.AERA_INTERNAL_API_TOKEN;
  if (!expected) return NextResponse.next();
  const actual = request.headers.get("authorization");
  if (actual !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized automation request" }, { status: 401 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/automation/:path*", "/api/collections/actions/:id/executed"],
};
