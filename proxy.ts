import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/session";

/** Endpoints n8n calls with the shared service token instead of a browser session. */
const SERVICE_PATHS = [/^\/api\/automation\//, /^\/api\/collections\/actions\/[^/]+\/executed$/];
const PUBLIC_PATHS = [/^\/$/, /^\/sign-in$/, /^\/sign-up$/, /^\/api\/auth\//];
const AUTH_PAGES = new Set(["/sign-in", "/sign-up"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);

  // Identity headers are only ever set here, never trusted from the client.
  const headers = new Headers(request.headers);
  headers.delete("x-kindlypay-service");
  if (!session) headers.delete("x-company-id");

  if (SERVICE_PATHS.some((pattern) => pattern.test(pathname)) && !session) {
    const expected = process.env.KINDLYPAY_INTERNAL_API_TOKEN;
    const authorized = expected ? request.headers.get("authorization") === `Bearer ${expected}` : process.env.NODE_ENV !== "production";
    if (!authorized) return NextResponse.json({ error: "Unauthorized automation request" }, { status: 401 });
    if (request.headers.get("x-company-id")) headers.set("x-company-id", request.headers.get("x-company-id")!);
    headers.set("x-kindlypay-service", "1");
    return NextResponse.next({ request: { headers } });
  }

  if (session && AUTH_PAGES.has(pathname)) return NextResponse.redirect(new URL("/dashboard", request.url));
  if (session || PUBLIC_PATHS.some((pattern) => pattern.test(pathname))) return NextResponse.next({ request: { headers } });

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|icon.svg|templates/|.*\\.(?:png|jpg|svg|ico|csv)$).*)"],
};
