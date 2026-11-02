import { NextResponse } from "next/server";
import { repository } from "@/lib/data";
import { DEMO_COMPANY_ID, createSeedData } from "@/lib/data/seed";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

/** One click into the fictional demo workspace, no account needed. Disable with KINDLYPAY_DEMO_LOGIN=off. */
export async function GET(request: Request) {
  if (process.env.KINDLYPAY_DEMO_LOGIN === "off") return NextResponse.redirect(new URL("/sign-in", request.url));
  try {
    await repository.today(DEMO_COMPANY_ID);
    await repository.policy(DEMO_COMPANY_ID);
  } catch {
    // With a real database the demo company exists only after `npm run db:seed-demo`.
    return NextResponse.redirect(new URL("/sign-in?demo=unavailable", request.url));
  }
  const seed = createSeedData();
  const user = seed.users[0];
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set(SESSION_COOKIE, createSessionToken({
    userId: user.id, companyId: DEMO_COMPANY_ID, companyName: seed.companies[0].name, name: user.name, email: user.email, role: user.role, demo: true,
  }, 60 * 60 * 8), { ...sessionCookieOptions, maxAge: 60 * 60 * 8 });
  return response;
}
