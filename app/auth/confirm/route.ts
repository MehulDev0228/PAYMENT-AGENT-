import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase";

const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/dashboard");

/**
 * The link in Supabase's confirmation email lands here. Handles both email link styles:
 * `?code=` (PKCE, the default for @supabase/ssr) and `?token_hash=&type=` (custom email templates).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type }) : { error: new Error("Missing confirmation code") };
  return NextResponse.redirect(new URL(error ? "/sign-in?error=link_expired" : next, request.url));
}
