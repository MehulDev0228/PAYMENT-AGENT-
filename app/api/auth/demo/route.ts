import { NextResponse } from "next/server";
import { authMode } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/auth/supabase";

/**
 * One click into the fictional demo workspace. In dev mode there is no sign-in, so it just opens the
 * workspace. With Supabase Auth it signs into a shared demo account whose credentials stay on the server
 * (KINDLYPAY_DEMO_EMAIL / KINDLYPAY_DEMO_PASSWORD, a user of the seeded demo company). Off with KINDLYPAY_DEMO_LOGIN=off.
 */
export async function GET(request: Request) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (process.env.KINDLYPAY_DEMO_LOGIN === "off") return to("/sign-in");
  if (authMode() === "dev") return to("/dashboard");
  const email = process.env.KINDLYPAY_DEMO_EMAIL;
  const password = process.env.KINDLYPAY_DEMO_PASSWORD;
  if (!email || !password) return to("/sign-in?demo=unavailable");
  const { error } = await (await createSupabaseServerClient()).auth.signInWithPassword({ email, password });
  return to(error ? "/sign-in?demo=unavailable" : "/dashboard");
}
