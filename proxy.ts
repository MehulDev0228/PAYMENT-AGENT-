import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveAuthMode, type AuthEnv } from "@/lib/auth/context";

/** Open to signed-out visitors. The auth pages check the session themselves. */
const PUBLIC_PATHS = [/^\/$/, /^\/sign-in$/, /^\/sign-up$/, /^\/auth\/confirm$/, /^\/api\/auth\//];

/**
 * Refreshes the Supabase session cookie and turns away signed-out requests before they reach the app:
 * pages redirect to /sign-in, API routes answer 401. Routes still derive the full identity themselves
 * (lib/auth), which is also where the n8n bearer token is verified.
 */
export async function proxy(request: NextRequest) {
  if (resolveAuthMode(process.env as AuthEnv) === "dev") return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  if (data?.claims?.sub || PUBLIC_PATHS.some((pattern) => pattern.test(pathname))) return response;

  if (pathname.startsWith("/api/")) {
    // n8n calls carry a bearer token instead of a session; the route checks it.
    if (/^Bearer\s/i.test(request.headers.get("authorization") ?? "")) return response;
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|templates/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
